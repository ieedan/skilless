import fs from 'node:fs';
import path from 'pathe';
import * as fsu from '@/utils/fs';
import * as git from '@/utils/git';
import {
	AGENTS_SKILLS,
	CLAUDE_SKILLS,
	skillDir,
	SKILLS_DIR,
	userAgentsSkills,
	userClaudeSkills
} from '@/utils/paths';
import { writeSkill } from '@/utils/skill';
import type { SkillFile } from '@/utils/types';

export type Materializable = { name: string; files?: SkillFile[]; editedAt?: number };

export type SkipReason = 'tracked' | 'occupied';

export type Skipped = {
	name: string;
	reason: SkipReason;
	/** At the user level rather than in the project. */
	user?: boolean;
	/** For `occupied`: what is in the way, and enough to `overwrite` it. */
	occupied?: { paths: string[]; scope: Scope; skill: Materializable };
};

export type MaterializeResult = {
	written: string[];
	skipped: Skipped[];
};

/**
 * A pair of skill directories skilless writes into: a project's, or the
 * user's own for global skills. `claude` is only ever links back into `agents`.
 */
export type Scope = {
	agents: string;
	claude: string;
	/** The repo whose exclude file hides what we write, or null at the user level. */
	repo: string | null;
};

/** A scope, or a project root as shorthand for its scope. */
export type Target = Scope | string;

export function projectScope(root: string): Scope {
	return {
		agents: path.join(root, AGENTS_SKILLS),
		claude: path.join(root, CLAUDE_SKILLS),
		repo: root
	};
}

/**
 * `~/.agents/skills` and `~/.claude/skills` — where global skills go, so every
 * project on the machine gets them without a copy of its own.
 */
export function userScope(): Scope {
	return { agents: userAgentsSkills(), claude: userClaudeSkills(), repo: null };
}

function toScope(target: Target): Scope {
	return typeof target === 'string' ? projectScope(target) : target;
}

/** Written by older versions; removed on sight so nothing is left behind. */
const LEGACY_MARKER = '.agents/skills/.skilless.json';

/** Resolves through a symlink even when its target is gone. */
function real(target: string): string {
	let resolved: string;
	try {
		resolved = path.normalize(fs.realpathSync(target));
	} catch {
		resolved = path.normalize(target);
	}

	// NTFS is case insensitive, and junctions can come back with a different drive case
	return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function linksTo(link: string, expected: string): boolean {
	try {
		const resolved = path.resolve(path.dirname(link), fs.readlinkSync(link));
		return real(resolved) === real(expected);
	} catch {
		return false;
	}
}

/**
 * Ownership is read off the links themselves rather than a file we write.
 *
 * `agents/<name>` points into the store when linked, and `claude/<name>`
 * points back at `agents/<name>` either way — so a copied skill is still
 * identifiable. A record on disk could drift from what is actually there; a
 * link cannot.
 */
function isOurs(scope: Scope, name: string): boolean {
	const agents = path.join(scope.agents, name);
	if (linksTo(agents, skillDir(name))) return true;
	return linksTo(path.join(scope.claude, name), agents);
}

export function ownedSkills(target: Target): string[] {
	const scope = toScope(target);
	if (!fsu.exists(scope.agents)) return [];

	return fs
		.readdirSync(scope.agents)
		.filter((name) => !name.startsWith('.'))
		.filter((name) => isOurs(scope, name))
		.sort();
}

/**
 * True when the claude directory is itself a link to the agents one, as with
 * `~/.claude/skills -> ~/.agents/skills`. There is only one place to write then,
 * and writing the claude side would clobber the agents side.
 */
function shared(scope: Scope): boolean {
	return fsu.exists(scope.claude) && real(scope.claude) === real(scope.agents);
}

/** Whatever sits where a skill belongs that is not ours, or nothing. */
function occupying(scope: Scope, name: string): string[] {
	const agents = path.join(scope.agents, name);
	const claude = path.join(scope.claude, name);
	const paths: string[] = [];

	if (fsu.exists(agents) && !isOurs(scope, name)) paths.push(agents);
	if (!shared(scope) && fsu.exists(claude) && !linksTo(claude, agents)) paths.push(claude);

	return paths;
}

function excludePatterns(names: string[]): string[] {
	return names.flatMap((name) => [`/${AGENTS_SKILLS}/${name}`, `/${CLAUDE_SKILLS}/${name}`]);
}

/**
 * Links a directory. Windows only allows symlinks with admin rights or
 * developer mode, but junctions need neither — they just have to be absolute.
 */
function link(target: string, linkPath: string): void {
	if (process.platform === 'win32') {
		fs.symlinkSync(path.resolve(path.dirname(linkPath), target), linkPath, 'junction');
	} else {
		fs.symlinkSync(target, linkPath, 'dir');
	}
}

/** Links where it can, copies where the platform will not allow it. */
function linkOrCopy(target: string, linkPath: string, fallback: () => void): void {
	fsu.ensureDir(path.dirname(linkPath));

	try {
		link(target, linkPath);
	} catch {
		fallback();
	}
}

/**
 * Writes skills into a project, or with `userScope()`, into the user's own
 * skill directories.
 *
 * `link` points `agents/<name>` at the store so editing a skill in one place
 * changes it everywhere. `copy` writes real files, which is what a cloud agent
 * gets since it has no store to point at.
 *
 * `claude/<name>` is always a link into `agents`, so a repo that already
 * tracks its own `.claude/skills` keeps what it has.
 */
export function materialize(
	target: Target,
	skills: Materializable[],
	opts: { copy: boolean }
): MaterializeResult {
	const scope = toScope(target);
	const { repo } = scope;

	if (repo) fsu.remove(path.join(repo, LEGACY_MARKER));

	const written: string[] = [];
	const skipped: Skipped[] = [];

	for (const skill of skills) {
		if (
			repo &&
			(git.isTracked(repo, `${AGENTS_SKILLS}/${skill.name}`) ||
				git.isTracked(repo, `${CLAUDE_SKILLS}/${skill.name}`))
		) {
			skipped.push({ name: skill.name, reason: 'tracked' });
			continue;
		}

		// something is already there that we did not put there. At the user
		// level especially, a hand made ~/.claude/skills/<name> must survive
		const inTheWay = occupying(scope, skill.name);
		if (inTheWay.length > 0) {
			skipped.push({
				name: skill.name,
				reason: 'occupied',
				...(repo ? {} : { user: true }),
				occupied: { paths: inTheWay, scope, skill }
			});
			continue;
		}

		write(scope, skill, opts);
		written.push(skill.name);
	}

	if (repo) {
		// drop the rule the marker used to need, for repos set up by an older version
		git.removeExcludes(repo, [`/${LEGACY_MARKER}`]);
		git.addExcludes(repo, excludePatterns(ownedSkills(scope)));
	}

	return { written, skipped };
}

/** Writes one skill into a scope, over anything of ours already there. */
function write(scope: Scope, skill: Materializable, opts: { copy: boolean }): void {
	const agents = path.join(scope.agents, skill.name);
	const claude = path.join(scope.claude, skill.name);
	const both = !shared(scope);

	fsu.remove(agents);
	if (both) fsu.remove(claude);

	if (opts.copy) {
		fsu.ensureDir(agents);
		for (const file of skill.files ?? []) {
			fsu.writeFile(path.join(agents, file.path), file.contents);
		}
	} else {
		const store = skillDir(skill.name);
		linkOrCopy(store, agents, () => fsu.copyDir(store, agents));
	}

	if (both) {
		const relative = path.relative(path.dirname(claude), agents);
		linkOrCopy(relative, claude, () => fsu.copyDir(agents, claude));
	}
}

/** Removes whatever is in a skill's way, then writes the skill there. */
export function overwrite(skip: Skipped, opts: { copy: boolean }): void {
	if (!skip.occupied) return;

	const { scope, skill, paths } = skip.occupied;

	for (const at of paths) fsu.remove(at);

	write(scope, skill, opts);

	if (scope.repo) git.addExcludes(scope.repo, excludePatterns([skill.name]));
}

export function unmaterialize(target: Target, names: string[]): string[] {
	const scope = toScope(target);
	const removed: string[] = [];

	for (const name of names) {
		if (!isOurs(scope, name)) continue;

		const agents = path.join(scope.agents, name);
		const claude = path.join(scope.claude, name);

		// only our link, never a directory of the same name someone else made
		if (!shared(scope) && linksTo(claude, agents)) fsu.remove(claude);
		fsu.remove(agents);
		removed.push(name);
	}

	if (scope.repo) git.removeExcludes(scope.repo, excludePatterns(removed));

	return removed;
}

/**
 * Drops links whose skill is gone from the store — what every other checkout is
 * left holding after `skilless delete` runs on one machine.
 */
export function prune(target: Target): string[] {
	const scope = toScope(target);
	const dangling = ownedSkills(scope).filter(
		(name) => !fs.existsSync(path.join(scope.agents, name))
	);

	if (dangling.length === 0) return [];

	return unmaterialize(scope, dangling);
}

/** The repo root, or the cwd when this is not a git repo at all. */
export function projectRoot(cwd: string): string {
	return git.repoRoot(cwd) ?? cwd;
}

export { writeSkill, SKILLS_DIR };
