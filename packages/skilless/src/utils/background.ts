import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'pathe';
import type { ApiClient } from '@/utils/api';
import { getToken } from '@/utils/auth';
import { cacheLibrary, readCache } from '@/utils/cache';
import { NotAuthenticatedError, OfflineError } from '@/utils/errors';
import * as fsu from '@/utils/fs';
import { projectKey } from '@/utils/git';
import { readLibrary } from '@/utils/library';
import { SKILLESS_DIR } from '@/utils/paths';
import { flushPending, isEmpty, readPending } from '@/utils/pending';
import { log } from '@/utils/prompts';
import { listLocalSkills } from '@/utils/skill';
import { adoptSources } from '@/utils/sources';
import { readState, writeState } from '@/utils/state';
import { planSync } from '@/utils/sync';
import type { LocalSkill, RemoteSkill } from '@/utils/types';

/**
 * Commands change only this machine, then hand the server its copy of the
 * change in a detached process, so the terminal is back the moment the local
 * work is done. The same process looks for changes made elsewhere, and leaves
 * what it found in `background.json` for the next command to mention.
 */

/** `0` turns the background process off, for tests and scripts that want none. */
export const BACKGROUND_ENV = 'SKILLESS_BACKGROUND';

export const BACKGROUND_COMMAND = '__background';

const STATUS_FILE = path.join(SKILLESS_DIR, 'background.json');
const LOCK_FILE = path.join(SKILLESS_DIR, 'background.lock');
/** Left by a push asked for while another was running, so that one goes again. */
const AGAIN_FILE = path.join(SKILLESS_DIR, 'background.again');

/** A lock older than this belongs to a process that died without letting go. */
const STALE_LOCK_MS = 5 * 60 * 1000;

/** Changes elsewhere are rare, so checking for them can wait this long. */
export const CHECK_INTERVAL_MS = 10 * 60 * 1000;

export type Status = {
	/** How the last push went. */
	push?: { at: number; error?: string; conflicts?: string[] };
	/** What the last check found waiting on the server. */
	remote?: { at: number; key: string | null; changes: number };
};

export function readStatus(): Status {
	return fsu.readJson<Status>(STATUS_FILE, {});
}

function updateStatus(change: (status: Status) => void): void {
	const status = readStatus();
	change(status);
	fsu.writeJson(STATUS_FILE, status);
}

/** After a full sync there is nothing left to say about either. */
export function clearStatus(): void {
	fsu.remove(STATUS_FILE);
}

let pushWanted = false;

/** Asks for a push once the command is done. Cheap to call more than once. */
export function pushInBackground(): void {
	pushWanted = true;
}

function enabled(): boolean {
	return process.env[BACKGROUND_ENV] !== '0' && getToken() !== null;
}

/**
 * What the last background run left to say: a push that failed or hit a
 * conflict, or changes waiting on the server. Shown after a command's own output.
 */
export function showNotices(): void {
	const { push, remote } = readStatus();
	const lines: (() => void)[] = [];

	if (push?.error) {
		lines.push(() =>
			log.warn(
				`${push.error}, so your last changes are only on this machine. They go with your next command, or run \`skilless sync\`.`
			)
		);
	}

	if (push?.conflicts?.length) {
		const names = push.conflicts;
		lines.push(() =>
			log.warn(
				`${names.join(', ')} changed here and on skilless.dev. Run \`skilless sync\` to settle ${names.length === 1 ? 'it' : 'them'}.`
			)
		);
	}

	if (remote && remote.changes > 0) {
		lines.push(() =>
			log.warn('Your skills changed on skilless.dev. Run `skilless sync` to bring them here.')
		);
	}

	if (lines.length === 0) return;

	log.blank();
	for (const line of lines) line();
}

/**
 * Whether anything on this machine has not reached the server: a queued change,
 * a skill made or edited here, or a push that failed last time. Any command
 * then retries it, not only one that changed something.
 */
function unsent(): boolean {
	if (!isEmpty(readPending()) || readStatus().push?.error) return true;

	const state = readState();
	return listLocalSkills().some(
		(skill) => state.skills[skill.name]?.contentHash !== skill.contentHash
	);
}

/** Due when it never ran, ran too long ago, or ran for another project. */
function checkDue(key: string | null): boolean {
	const last = readStatus().remote;
	return !last || last.key !== key || Date.now() - last.at > CHECK_INTERVAL_MS;
}

/**
 * Starts the background process if there is anything for it to do: a push the
 * command asked for, or a check that is due. Called once, after the command.
 */
export function startBackground(cwd: string): void {
	if (!enabled()) return;

	const key = projectKey(cwd);
	const push = pushWanted || unsent();
	const check = checkDue(key);
	if (!push && !check) return;

	const script = process.argv[1];
	if (!script) return;

	const args = [script, BACKGROUND_COMMAND];
	if (push) args.push('--push');
	if (check) args.push('--check', ...(key ? ['--key', key] : []));

	try {
		spawn(process.execPath, args, { detached: true, stdio: 'ignore', env: process.env }).unref();
	} catch {
		// the next command tries again
	}
}

function lock(): boolean {
	fsu.ensureDir(SKILLESS_DIR);

	try {
		fs.writeFileSync(LOCK_FILE, String(process.pid), { flag: 'wx' });
		return true;
	} catch {
		try {
			if (Date.now() - fs.statSync(LOCK_FILE).mtimeMs < STALE_LOCK_MS) return false;
			fsu.remove(LOCK_FILE);
			fs.writeFileSync(LOCK_FILE, String(process.pid), { flag: 'wx' });
			return true;
		} catch {
			return false;
		}
	}
}

function describe(e: unknown): string {
	if (e instanceof OfflineError) return `Couldn't reach ${e.url}`;
	if (e instanceof NotAuthenticatedError) return 'Your sign-in was rejected';
	return e instanceof Error ? e.message : String(e);
}

/** The body of `skilless __background`. Never prompts, never prints. */
export async function runBackground(
	api: ApiClient,
	opts: { push: boolean; check: boolean; key: string | null }
): Promise<void> {
	if (!lock()) {
		// someone else is at it; make sure they also send what this run was for
		if (opts.push) fs.writeFileSync(AGAIN_FILE, '');
		return;
	}

	try {
		let push = opts.push;

		do {
			fsu.remove(AGAIN_FILE);

			if (push) {
				try {
					const { conflicts } = await pushChanges(api);
					updateStatus((status) => {
						status.push = { at: Date.now(), ...(conflicts.length > 0 ? { conflicts } : {}) };
					});
				} catch (e) {
					updateStatus((status) => {
						status.push = { at: Date.now(), error: describe(e) };
					});
					return;
				}
			}

			push = fsu.exists(AGAIN_FILE);
		} while (push);

		if (opts.check) {
			const changes = await countRemoteChanges(api, opts.key).catch(() => null);
			if (changes !== null) {
				updateStatus((status) => {
					status.remote = { at: Date.now(), key: opts.key, changes };
				});
			}
		}
	} finally {
		fsu.remove(LOCK_FILE);
	}
}

/**
 * Sends what changed here: new and edited skills, then every queued change.
 * Only ever pushes — a skill that changed on the server as well is left for
 * `skilless sync` to settle, and reported as a conflict.
 */
export async function pushChanges(api: ApiClient): Promise<{ conflicts: string[] }> {
	const listed = await api.listSkills();
	const remote = new Map<string, RemoteSkill>(listed.map((skill) => [skill.name, skill]));
	const local = new Map<string, LocalSkill>(listLocalSkills().map((skill) => [skill.name, skill]));

	const actions = planSync(local, remote, readState());
	const conflicts = actions
		.filter((action) => action.type === 'conflict-push' || action.type === 'conflict-pull')
		.map((action) => action.name);

	for (const { name } of actions.filter((action) => action.type === 'push')) {
		const skill = local.get(name)!;
		remote.set(name, await api.putSkill(name, skill.files, skill.editedAt));

		// read fresh: the command that queued this may have written since
		const state = readState();
		state.skills[name] = {
			contentHash: skill.contentHash,
			editedAt: skill.editedAt,
			syncedAt: Date.now()
		};
		writeState(state);
	}

	const sent = await flushPending(api, [...remote.values()]);
	const latest = sent > 0 ? await api.listSkills() : [...remote.values()];
	cacheLibrary(latest);
	adoptSources(latest);

	return { conflicts };
}

/**
 * How many things `skilless sync` would bring down: skills changed or deleted
 * on the server, and globals or this project's skills changed there. What
 * this machine has queued to send does not count — it is on its way.
 */
export async function countRemoteChanges(api: ApiClient, key: string | null): Promise<number> {
	const [listed, resolved] = await Promise.all([
		api.listSkills(),
		key ? api.getBindings(key) : Promise.resolve(null)
	]);

	const remote = new Map<string, RemoteSkill>(listed.map((skill) => [skill.name, skill]));
	const local = new Map<string, LocalSkill>(listLocalSkills().map((skill) => [skill.name, skill]));
	const incoming = new Set(['pull', 'conflict-push', 'conflict-pull', 'delete-local']);

	let changes = planSync(local, remote, readState()).filter((action) =>
		incoming.has(action.type)
	).length;

	const pending = readPending();
	const library = new Map((await readLibrary(null)).entries.map((entry) => [entry.name, entry]));

	for (const skill of listed) {
		const here = library.get(skill.name);
		if (here && !(skill.name in pending.globals) && here.global !== skill.global) changes++;
	}

	if (key && resolved) {
		const change = pending.projects[key] ?? { add: [], remove: [] };
		const queued = new Set([...change.add, ...change.remove]);
		const there = new Set(resolved.filter((skill) => !skill.global).map((skill) => skill.name));
		// only what this machine last heard; a project it never asked about has nothing to compare
		const here = readCache().projects[key];

		if (here) {
			const differs = [...there]
				.filter((name) => !here.includes(name))
				.concat(here.filter((name) => !there.has(name)))
				.filter((name) => !queued.has(name));
			changes += differs.length;
		}
	}

	return changes;
}
