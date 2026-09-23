import type { ApiClient } from '@/utils/api';
import { cacheProject } from '@/utils/cache';
import * as fsu from '@/utils/fs';
import { skillDir, SKILLS_DIR } from '@/utils/paths';
import * as project from '@/utils/project';
import { findLocalSkill, writeSkill } from '@/utils/skill';
import { readState, writeState } from '@/utils/state';
import type { RemoteSkillWithFiles } from '@/utils/types';

/**
 * Cloud agents have no store to link against, so they get real files. Locally we
 * link, which is the whole point — one copy on disk however many projects use it.
 */
export function shouldCopy(explicit?: boolean): boolean {
	return explicit ?? !fsu.exists(SKILLS_DIR);
}

export type InstallResult = project.MaterializeResult & { fetched: string[]; removed: string[] };

/**
 * Makes skills visible to agents, in a project or at the user level.
 *
 * In link mode any skill missing from the store is fetched first, but a skill
 * already there is left alone — pulling over it would silently discard an edit
 * you hadn't synced yet.
 */
export async function installSkills(
	target: project.Target,
	skills: RemoteSkillWithFiles[],
	opts: { copy?: boolean; reconcile?: boolean } = {}
): Promise<InstallResult> {
	const copy = shouldCopy(opts.copy);
	const fetched: string[] = [];

	if (!copy) {
		const state = readState();

		for (const skill of skills) {
			if (findLocalSkill(skill.name)) continue;

			writeSkill(skill.name, skill.files, skill.editedAt);
			state.skills[skill.name] = {
				contentHash: skill.contentHash,
				editedAt: skill.editedAt,
				syncedAt: Date.now()
			};
			fetched.push(skill.name);
		}

		writeState(state);
	}

	const result = project.materialize(target, skills, { copy });

	// anything we own that no longer belongs here — unbound on the website, or
	// a skill that stopped (or started) being global
	const removed = opts.reconcile
		? project.unmaterialize(
				target,
				project.ownedSkills(target).filter((name) => !skills.some((skill) => skill.name === name))
			)
		: [];

	return { ...result, fetched, removed };
}

export async function boundNames(api: ApiClient, key: string): Promise<string[]> {
	return (await api.getBindings(key)).map((skill) => skill.name);
}

export type ScopeInstall = InstallResult & {
	/** Links whose skill is gone from the store. */
	pruned: string[];
	/** Skills this scope did not have before, as opposed to ones relinked in place. */
	added: string[];
};

export type ProjectInstall = {
	/** `.agents/skills` in the project — what is bound to it. */
	project: ScopeInstall;
	/** `~/.agents/skills` — every global skill, shared by every project. */
	user: ScopeInstall;
	/** Everything written, from both, for the warnings. */
	skipped: project.Skipped[];
	/** How many skills the server resolves for this project, globals included. */
	count: number;
};

async function installScope(
	target: project.Target,
	skills: RemoteSkillWithFiles[],
	opts: { copy?: boolean }
): Promise<ScopeInstall> {
	const pruned = project.prune(target);
	const before = new Set(project.ownedSkills(target));

	const result = await installSkills(target, skills, { copy: opts.copy, reconcile: true });

	return { ...result, pruned, added: result.written.filter((name) => !before.has(name)) };
}

/**
 * Brings a project's `.agents/skills` in line with what the server says it
 * should have, and `~/.agents/skills` in line with your global skills. Shared
 * by `install`, and by `sync` whenever it runs inside a project, so the two
 * can never disagree about what a project holds.
 *
 * Reconciles even when nothing is bound — that is exactly when the last
 * unbound skill needs its link removed.
 */
export async function installProject(
	api: ApiClient,
	root: string,
	key: string,
	opts: { copy?: boolean } = {}
): Promise<ProjectInstall> {
	const skills = await api.getBindings(key);
	cacheProject(key, skills);

	return installResolved(root, skills, opts);
}

/**
 * Installs what the server resolved for a project. Globals live only at the
 * user level, so a skill that becomes global moves out of the project rather
 * than sitting in both places — and moves back in if it stops being global
 * while still bound.
 */
export async function installResolved(
	root: string,
	skills: RemoteSkillWithFiles[],
	opts: { copy?: boolean } = {}
): Promise<ProjectInstall> {
	const inProject = await installScope(
		root,
		skills.filter((skill) => !skill.global),
		opts
	);
	const inUser = await installScope(
		project.userScope(),
		skills.filter((skill) => skill.global),
		opts
	);

	return {
		project: inProject,
		user: inUser,
		skipped: [...inProject.skipped, ...inUser.skipped],
		count: skills.length
	};
}

/**
 * Links your global skills at the user level from the store, and unlinks the
 * ones that are no longer global. For `sync` outside a project, where there
 * are no bindings to fetch — after a sync the store already has every skill.
 */
export function linkGlobals(globals: string[]): ScopeInstall {
	const target = project.userScope();
	const pruned = project.prune(target);
	const before = new Set(project.ownedSkills(target));

	const result = project.materialize(
		target,
		globals.filter((name) => fsu.exists(skillDir(name))).map((name) => ({ name })),
		{ copy: false }
	);
	const removed = project.unmaterialize(
		target,
		project.ownedSkills(target).filter((name) => !globals.includes(name))
	);

	return {
		...result,
		fetched: [],
		removed,
		pruned,
		added: result.written.filter((name) => !before.has(name))
	};
}
