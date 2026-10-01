import { goto } from '$app/navigation';
import { api } from '@skilless/platform';
import type { useConvexClient } from '@skilless/platform/client';
import type { FunctionReturnType } from 'convex/server';
import { toast } from 'svelte-sonner';
import { parseAddress } from '$lib/pack';
import type { SkillSource } from '$lib/source';

type Client = ReturnType<typeof useConvexClient>;
type Result = FunctionReturnType<typeof api.imports.fromGithub>;
export type Conflict = Result['conflicts'][number];

/** One pick on its way into the library: a skill, or (`dir: null`) a whole repo. */
export type Pending = {
	id: string;
	key: string;
	dir: string | null;
	/** The skill's name, when it is one skill; a whole repo shows as the repo. */
	name?: string;
	description?: string;
	/** When it set off, to tell its skill arriving from one that was already there. */
	startedAt: number;
	/** An update of a skill already in the library: its own row shows the spinner, not a new one. */
	update?: boolean;
};

/** Where the website can fetch a skill from again: a GitHub repo, or a skill on skilless. */
export type UpdatableSource =
	| { kind: 'github'; key: string; dir: string }
	| { kind: 'skilless'; username: string; name: string };

/** A skill's source, if the website can update from it. Other git hosts update through the CLI. */
export function updatableSource(source: SkillSource | null | undefined): UpdatableSource | null {
	if (!source) return null;
	const address = parseAddress(source.url);
	if (address?.kind === 'skill') {
		return { kind: 'skilless', username: address.username, name: address.name };
	}
	const github = /^(?:https?:\/\/)?github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i.exec(source.url);
	return github
		? {
				kind: 'github',
				key: `github.com/${github[1]}/${github[2]}`.toLowerCase(),
				dir: source.path
			}
		: null;
}

const plural = (n: number) => `${n} ${n === 1 ? 'skill' : 'skills'}`;

/**
 * Copies from GitHub run here, not in the picker, so the picker closes at once
 * and the copy carries on wherever you go. The skills list shows what is on its
 * way; a toast says when it lands.
 */
class Imports {
	pending = $state<Pending[]>([]);
	/** Skills by the same name, with other files, waiting on you to say whether to replace them. */
	conflicts = $state<Conflict[]>([]);
	/** Whether the conflicts are up for review; a toast's button opens them. */
	reviewing = $state(false);

	/** Starts copying. Returns at once; the list and a toast follow it. */
	start(client: Client, picks: Omit<Pending, 'id' | 'startedAt'>[], replace?: string[]) {
		const startedAt = Date.now();
		const batch = picks.map((pick) => ({ ...pick, id: crypto.randomUUID(), startedAt }));
		const ids = new Set<string>(batch.map((pick) => pick.id));
		this.pending = [...this.pending, ...batch];

		client
			.action(api.imports.fromGithub, {
				picks: batch.map(({ key, dir }) => ({ key, dir })),
				replace
			})
			.then((result) => this.#report(result))
			.catch(() => toast.error('Could not add those skills'))
			.finally(() => {
				this.pending = this.pending.filter((pick) => !ids.has(pick.id));
			});
	}

	/**
	 * Fetches a skill from its source again, replacing what is in the library.
	 * The skill's own row shows it loading meanwhile; a toast says how it went.
	 */
	async updateFromSource(client: Client, skill: { name: string; source?: SkillSource | null }) {
		const from = updatableSource(skill.source);
		if (!from) return;

		const id = crypto.randomUUID();
		this.pending = [
			...this.pending,
			{
				id,
				key: from.kind === 'github' ? from.key : `skilless/${from.username}`,
				dir: from.kind === 'github' ? from.dir : null,
				name: skill.name,
				startedAt: Date.now(),
				update: true
			}
		];

		try {
			const outcome =
				from.kind === 'github'
					? await client
							.action(api.imports.fromGithub, {
								picks: [{ key: from.key, dir: from.dir }],
								replace: [skill.name]
							})
							.then((result) =>
								result.added.length > 0
									? 'updated'
									: result.unchanged.length > 0
										? 'same'
										: (result.failed[0]?.reason ?? 'missing')
							)
					: await client
							.action(api.imports.fromSkilless, {
								username: from.username,
								name: from.name,
								replace: true
							})
							.then((result) =>
								result.status === 'added'
									? 'updated'
									: result.status === 'unchanged'
										? 'same'
										: result.status === 'own'
											? 'it is your own skill'
											: 'missing'
							);

			if (outcome === 'updated') toast.success(`Updated ${skill.name} from its source`);
			else if (outcome === 'same') toast.info(`${skill.name} already matches its source`);
			else if (outcome === 'missing') toast.error(`${skill.name} is no longer at its source`);
			else toast.error(`Couldn't update ${skill.name}: ${outcome}`);
		} catch {
			toast.error(`Could not update ${skill.name}`);
		} finally {
			this.pending = this.pending.filter((pick) => pick.id !== id);
		}
	}

	/** Whether a skill already in the library is being updated from its source. */
	isUpdating(name: string) {
		return this.pending.some((pick) => pick.update && pick.name === name);
	}

	/** Replaces the conflicts you ticked; the rest are let go. */
	replace(client: Client, names: string[]) {
		const chosen = this.conflicts.filter((conflict) => names.includes(conflict.name));
		this.dismiss();
		if (chosen.length === 0) return;
		this.start(
			client,
			chosen.map(({ key, dir, name }) => ({ key, dir, name })),
			chosen.map((conflict) => conflict.name)
		);
	}

	dismiss() {
		this.conflicts = [];
		this.reviewing = false;
	}

	#report(result: Result) {
		const added = result.added.length;
		if (added > 0) {
			const [first] = result.added;
			toast.success(added === 1 ? `Added ${first}` : `Added ${plural(added)} to your library`, {
				action: {
					label: 'View',
					// one skill opens on its page; several, on the list they landed in
					onClick: () =>
						goto(added === 1 ? `/my-skills/${encodeURIComponent(first!)}` : '/my-skills')
				}
			});
		} else if (result.unchanged.length > 0 && result.conflicts.length === 0) {
			toast.info(
				result.unchanged.length === 1
					? `${result.unchanged[0]} is already in your library`
					: `Those ${plural(result.unchanged.length)} are already in your library`
			);
		}

		for (const failed of result.failed) {
			toast.error(`Couldn't add ${failed.name ?? (failed.dir || failed.key)}: ${failed.reason}`);
		}

		if (result.conflicts.length > 0) {
			const names = new Set(result.conflicts.map((conflict) => conflict.name));
			this.conflicts = [
				...this.conflicts.filter((conflict) => !names.has(conflict.name)),
				...result.conflicts
			];
			const n = result.conflicts.length;
			toast.warning(
				n === 1
					? `You already have a different ${result.conflicts[0]!.name}`
					: `You already have different skills by ${n} of those names`,
				{
					duration: 10_000,
					action: {
						label: 'Review',
						onClick: () => {
							this.reviewing = true;
							goto('/my-skills');
						}
					}
				}
			);
		}
	}
}

export const imports = new Imports();
