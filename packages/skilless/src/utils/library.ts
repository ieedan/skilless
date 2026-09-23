import { cacheLibrary, cacheProject, readCache } from '@/utils/cache';
import { installResolved, linkGlobals, shouldCopy } from '@/utils/install';
import { flushPending, type Pending, readPending } from '@/utils/pending';
import * as project from '@/utils/project';
import type { Remote } from '@/utils/remote';
import { listLocalSkills, writeSkill } from '@/utils/skill';
import { adoptSources, readSources, setSource } from '@/utils/sources';
import { readState, writeState } from '@/utils/state';
import type { LocalSkill, RemoteSkill, SkillSource } from '@/utils/types';

export type LibraryEntry = {
	name: string;
	global: boolean;
	/** In `~/.skilless/skills`, so it can be linked without the server. */
	local: LocalSkill | null;
	/** What the server has, live or as last seen. */
	remote: RemoteSkill | null;
	/** Changed here since the last sync. */
	unsynced: boolean;
	/** The repo it was copied from, if it was. */
	source: SkillSource | null;
};

export type Library = {
	entries: LibraryEntry[];
	/** False when the server could not be reached and the cache stood in. */
	live: boolean;
};

/**
 * Sends whatever is queued in `pending.json`. Every command that uses the
 * server calls this first, so what it reads back already includes it.
 */
export async function flush(remote: Remote): Promise<void> {
	await remote.try((api) => flushPending(api));
}

/**
 * Your library as best this machine can tell: the skills on disk, plus what
 * the server has — fresh when it answers, from the cache when it does not —
 * with any change still waiting to reach the server applied on top.
 */
export async function readLibrary(remote: Remote): Promise<Library> {
	const fetched = await remote.try((api) => api.listSkills());
	if (fetched) {
		cacheLibrary(fetched);
		adoptSources(fetched);
	}

	const remoteSkills = fetched ?? readCache().library ?? [];
	const pending = readPending();
	const state = readState();
	const sources = readSources();

	const local = new Map(listLocalSkills().map((skill) => [skill.name, skill]));
	const there = new Map(remoteSkills.map((skill) => [skill.name, skill]));
	const names = [...new Set([...local.keys(), ...there.keys()])]
		.filter((name) => !pending.deletes.includes(name))
		.sort();

	const entries = names.map((name): LibraryEntry => {
		const here = local.get(name) ?? null;
		const remoteSkill = there.get(name) ?? null;

		return {
			name,
			global: pending.globals[name] ?? remoteSkill?.global ?? false,
			local: here,
			remote: remoteSkill,
			unsynced: here !== null && state.skills[name]?.contentHash !== here.contentHash,
			source: sources[name] ?? null
		};
	});

	return { entries, live: fetched !== undefined };
}

/** Names of the skills bound to a project, globals not included. */
export async function readBindings(remote: Remote, key: string): Promise<string[]> {
	const fetched = await remote.try((api) => api.getBindings(key));
	if (fetched) cacheProject(key, fetched);

	const bound = fetched
		? fetched.filter((skill) => !skill.global).map((skill) => skill.name)
		: (readCache().projects[key] ?? []);

	const pending = readPending();
	const change = pending.projects[key] ?? { add: [], remove: [] };

	return [...new Set([...bound, ...change.add])]
		.filter((name) => !change.remove.includes(name) && !pending.deletes.includes(name))
		.sort();
}

/**
 * Everything a project's agents see: what is bound to it, and every global —
 * though globals are linked at the user level rather than into the project.
 */
export function resolveProject(library: Library, bound: string[]): LibraryEntry[] {
	const names = new Set(bound);
	return library.entries.filter((entry) => entry.global || names.has(entry.name));
}

export type ScopeRefresh = project.MaterializeResult & { removed: string[] };

export type ProjectRefresh = {
	/** The project's own `.agents/skills`. */
	project: ScopeRefresh;
	/** `~/.agents/skills`, where global skills live. */
	user: ScopeRefresh;
	skipped: project.Skipped[];
	/** Belongs here but is not on this machine, and the server is out of reach. */
	missing: string[];
};

/**
 * Brings a project's links in line with its skills, and the user level in line
 * with your globals.
 *
 * With the server, this is `install`: fetch what is missing, and unlink
 * whatever the server no longer resolves. Without it, only the skills already
 * on disk can be linked, and only links this machine was told to drop — by a
 * queued unbind, a change of global, or a delete — are removed. A stale or
 * empty cache must never read as "this project has nothing".
 */
export async function refreshProject(
	remote: Remote,
	root: string,
	key: string,
	opts: { copy?: boolean } = {}
): Promise<ProjectRefresh> {
	const fetched = await remote.try((api) => api.getBindings(key));

	if (fetched) {
		cacheProject(key, fetched);
		return { ...(await installResolved(root, fetched, { copy: opts.copy })), missing: [] };
	}

	const library = await readLibrary(remote);
	const resolved = resolveProject(library, await readBindings(remote, key));
	const bound = resolved.filter((entry) => !entry.global);
	const globals = resolved.filter((entry) => entry.global);

	const pending = readPending();
	const deleted = new Set(pending.deletes);
	const madeGlobal = (value: boolean) => queuedGlobals(pending, value);

	const copy = shouldCopy(opts.copy);

	// a skill that just became global moves out of the project, and one that
	// stopped being global leaves the user level
	const inProject = refreshOffline(
		root,
		bound,
		new Set([...(pending.projects[key]?.remove ?? []), ...deleted, ...madeGlobal(true)]),
		copy
	);
	const inUser = refreshOffline(
		project.userScope(),
		globals,
		new Set([...deleted, ...madeGlobal(false)]),
		copy
	);

	return {
		project: inProject,
		user: inUser,
		skipped: [...inProject.skipped, ...inUser.skipped],
		missing: resolved.filter((entry) => !entry.local).map((entry) => entry.name)
	};
}

function queuedGlobals(pending: Pending, value: boolean): string[] {
	return Object.entries(pending.globals)
		.filter(([, v]) => v === value)
		.map(([name]) => name);
}

/**
 * Links what is on disk, and unlinks only what this machine was told to drop.
 * Without the server that is all that can be trusted.
 */
function refreshOffline(
	target: project.Target,
	entries: LibraryEntry[],
	dropped: Set<string>,
	copy: boolean
): ScopeRefresh {
	const wanted = new Set(entries.map((entry) => entry.name));

	project.prune(target);
	const removed = project.unmaterialize(
		target,
		project.ownedSkills(target).filter((name) => dropped.has(name) && !wanted.has(name))
	);

	const available = entries.flatMap((entry) => (entry.local ? [entry.local] : []));
	return { ...project.materialize(target, available, { copy }), removed };
}

/**
 * Brings the user level in line with your globals, for commands run outside a
 * project. Everything is linked from the store, so a global that is not on
 * this machine yet waits for the next sync.
 */
export async function refreshGlobals(
	remote: Remote
): Promise<ScopeRefresh & { missing: string[] }> {
	const library = await readLibrary(remote);
	const globals = library.entries.filter((entry) => entry.global);
	const missing = globals.filter((entry) => !entry.local).map((entry) => entry.name);

	if (library.live) {
		return { ...linkGlobals(globals.map((entry) => entry.name)), missing };
	}

	const pending = readPending();
	const dropped = new Set([...pending.deletes, ...queuedGlobals(pending, false)]);

	return {
		...refreshOffline(project.userScope(), globals, dropped, false),
		missing
	};
}

/**
 * Writes skills into `~/.skilless/skills` and pushes each one, replacing
 * whatever of the same name was there. Returns their names, in order.
 *
 * A skill's source is set from `sources`; one saved without an entry there is
 * no longer the repo's copy, so any source it had is forgotten.
 */
export async function saveToLibrary(
	remote: Remote,
	skills: LocalSkill[],
	existing: Map<string, LibraryEntry>,
	sources: Map<string, SkillSource> = new Map()
): Promise<string[]> {
	const state = readState();

	for (const skill of skills) {
		setSource(skill.name, sources.get(skill.name) ?? null);

		writeSkill(skill.name, skill.files, skill.editedAt);

		const pushed = await remote.try((api) => api.putSkill(skill.name, skill.files, skill.editedAt));
		const overwritten = existing.get(skill.name)?.remote;

		if (pushed) {
			state.skills[skill.name] = {
				contentHash: skill.contentHash,
				editedAt: skill.editedAt,
				syncedAt: Date.now()
			};
		} else if (overwritten) {
			// record the copy being replaced as the last synced one, so the next
			// sync reads this as an edit made here and pushes it — rather than
			// a conflict it might settle the other way
			state.skills[skill.name] = {
				contentHash: overwritten.contentHash,
				editedAt: overwritten.editedAt,
				syncedAt: Date.now()
			};
		} else {
			// a skill state.json has never seen is new, so the next sync pushes it
			delete state.skills[skill.name];
		}
	}

	writeState(state);

	// the sources can only go once the skills they describe are there
	await flush(remote);

	return skills.map((skill) => skill.name);
}
