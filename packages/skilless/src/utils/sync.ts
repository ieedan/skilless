import path from 'pathe';
import type { ApiClient } from '@/utils/api';
import * as fsu from '@/utils/fs';
import { CONFLICTS_DIR, skillDir } from '@/utils/paths';
import * as prompts from '@/utils/prompts';
import { fileBytes, writeSkill } from '@/utils/skill';
import type { State } from '@/utils/state';
import type { LocalSkill, RemoteSkill, SkillFile } from '@/utils/types';

export type SyncActionType =
	'noop' | 'push' | 'pull' | 'conflict-push' | 'conflict-pull' | 'delete-local' | 'delete-remote';

export type SyncAction = { type: SyncActionType; name: string };

export type Side = 'push' | 'pull';

export type SyncReport = {
	actions: SyncAction[];
	conflicts: { name: string; kept: Side; stashedAt: string }[];
	skipped: string[];
};

/**
 * Decides what to do with every skill, without touching anything.
 *
 * `state` is what was true at the last successful sync. It is the only thing
 * that distinguishes "deleted over there" from "created over here" — without it
 * a fresh machine looks exactly like someone who deleted their whole library.
 */
export function planSync(
	local: Map<string, LocalSkill>,
	remote: Map<string, RemoteSkill>,
	state: State,
	force?: Side
): SyncAction[] {
	const names = [...new Set([...local.keys(), ...remote.keys()])].sort();
	const actions: SyncAction[] = [];

	for (const name of names) {
		const here = local.get(name);
		const there = remote.get(name);
		const synced = state.skills[name];

		if (here && there) {
			if (here.contentHash === there.contentHash) {
				actions.push({ type: 'noop', name });
				continue;
			}

			const changedHere = !synced || synced.contentHash !== here.contentHash;
			const changedThere = !synced || synced.contentHash !== there.contentHash;

			if (changedHere && !changedThere) actions.push({ type: 'push', name });
			else if (!changedHere && changedThere) actions.push({ type: 'pull', name });
			else {
				// both moved — last write wins, and the loser gets stashed
				const winner: Side = force ?? (here.editedAt >= there.editedAt ? 'push' : 'pull');
				actions.push({
					type: winner === 'push' ? 'conflict-push' : 'conflict-pull',
					name
				});
			}

			continue;
		}

		if (here && !there) {
			actions.push({ type: synced ? 'delete-local' : 'push', name });
			continue;
		}

		if (!here && there) {
			actions.push({ type: synced ? 'delete-remote' : 'pull', name });
		}
	}

	return actions;
}

/** Keeps the losing copy of a conflict so last-write-wins can never destroy work. */
function stash(name: string, side: Side, files: SkillFile[]): string {
	return stashFiles(name, side === 'push' ? 'remote' : 'local', files);
}

/** Writes a copy of a skill under `~/.skilless/conflicts` and returns where. */
export function stashFiles(name: string, label: string, files: SkillFile[]): string {
	const stamp = new Date().toISOString().replace(/[:.]/g, '-');
	const dir = path.join(CONFLICTS_DIR, name, `${stamp}-${label}`);

	for (const file of files) fsu.writeFile(path.join(dir, file.path), fileBytes(file));

	return dir;
}

/** How many skills are sent or fetched at once. */
const CONCURRENCY = 8;

/** Runs `task` over `items` with at most `limit` in flight, resolving in input order. */
async function mapLimit<T, R>(
	items: T[],
	limit: number,
	task: (item: T) => Promise<R>
): Promise<R[]> {
	const results = new Array<R>(items.length);
	let next = 0;

	const worker = async () => {
		while (next < items.length) {
			const index = next++;
			results[index] = await task(items[index]!);
		}
	};

	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
	return results;
}

/**
 * Carries out a plan. Confirmations are asked one at a time up front; the
 * network work then runs concurrently, since each skill is independent.
 *
 * `remote` is kept up to date as skills are pushed and deleted, so the caller
 * can use it as the library afterwards without listing it again.
 */
export async function applySync(
	api: ApiClient,
	actions: SyncAction[],
	context: {
		local: Map<string, LocalSkill>;
		remote: Map<string, RemoteSkill>;
		state: State;
		yes: boolean;
	}
): Promise<SyncReport> {
	const report: SyncReport = { actions: [], conflicts: [], skipped: [] };
	const now = Date.now();

	const confirmed = new Set<SyncAction>();
	for (const action of actions) {
		if (action.type !== 'delete-local' && action.type !== 'delete-remote') continue;

		const ok =
			context.yes ||
			(await prompts.confirm(
				action.type === 'delete-local'
					? `Delete ${action.name} from this machine? It was deleted elsewhere.`
					: `Delete ${action.name} everywhere? It was deleted on this machine.`,
				true
			));

		if (ok) confirmed.add(action);
		else report.skipped.push(action.name);
	}

	const apply = async (action: SyncAction): Promise<boolean> => {
		const { name } = action;
		const here = context.local.get(name);

		switch (action.type) {
			case 'noop': {
				if (here) {
					context.state.skills[name] = {
						contentHash: here.contentHash,
						editedAt: here.editedAt,
						syncedAt: now
					};
				}
				return true;
			}

			case 'push':
			case 'conflict-push': {
				if (!here) return true;

				if (action.type === 'conflict-push') {
					const theirs = await api.getSkill(name);
					if (theirs) {
						report.conflicts.push({
							name,
							kept: 'push',
							stashedAt: stash(name, 'push', theirs.files)
						});
					}
				}

				context.remote.set(name, await api.putSkill(name, here.files, here.editedAt));
				context.state.skills[name] = {
					contentHash: here.contentHash,
					editedAt: here.editedAt,
					syncedAt: now
				};
				return true;
			}

			case 'pull':
			case 'conflict-pull': {
				const theirs = await api.getSkill(name);
				if (!theirs) return true;

				if (action.type === 'conflict-pull' && here) {
					report.conflicts.push({
						name,
						kept: 'pull',
						stashedAt: stash(name, 'pull', here.files)
					});
				}

				writeSkill(name, theirs.files, theirs.editedAt);
				context.state.skills[name] = {
					contentHash: theirs.contentHash,
					editedAt: theirs.editedAt,
					syncedAt: now
				};
				return true;
			}

			case 'delete-local': {
				if (!confirmed.has(action)) return false;

				fsu.remove(skillDir(name));
				delete context.state.skills[name];
				return true;
			}

			case 'delete-remote': {
				if (!confirmed.has(action)) return false;

				await api.deleteSkill(name);
				context.remote.delete(name);
				delete context.state.skills[name];
				return true;
			}
		}
	};

	const applied = await mapLimit(actions, CONCURRENCY, apply);

	// in plan order, not completion order, so the log reads the same every run
	report.actions = actions.filter((_, index) => applied[index]);
	report.conflicts.sort((a, b) => a.name.localeCompare(b.name));

	return report;
}

export function describe(action: SyncAction): string | null {
	switch (action.type) {
		case 'push':
			return `Pushed ${action.name} to skilless.dev.`;
		case 'pull':
			return `Pulled ${action.name} from skilless.dev.`;
		case 'conflict-push':
			return `${action.name} changed in both places. Kept the copy on this machine.`;
		case 'conflict-pull':
			return `${action.name} changed in both places. Kept the copy from skilless.dev.`;
		case 'delete-local':
			return `Deleted ${action.name} from this machine.`;
		case 'delete-remote':
			return `Deleted ${action.name} everywhere.`;
		default:
			return null;
	}
}
