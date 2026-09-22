import fs from 'node:fs';
import path from 'pathe';
import * as fsu from '@/utils/fs';
import * as git from '@/utils/git';
import { AGENTS_SKILLS, CLAUDE_SKILLS, skillDir, SKILLS_DIR } from '@/utils/paths';
import { writeSkill } from '@/utils/skill';
import type { SkillFile } from '@/utils/types';

export type Materializable = { name: string; files?: SkillFile[]; editedAt?: number };

export type SkipReason = 'tracked' | 'occupied';

export type MaterializeResult = {
	written: string[];
	skipped: { name: string; reason: SkipReason }[];
};

/** Written by older versions; removed on sight so nothing is left behind. */
const LEGACY_MARKER = '.agents/skills/.skilless.json';

function agentsPath(root: string, name: string): string {
	return path.join(root, AGENTS_SKILLS, name);
}

function claudePath(root: string, name: string): string {
	return path.join(root, CLAUDE_SKILLS, name);
}

/** Resolves through a symlink even when its target is gone. */
function real(target: string): string {
	try {
		return fs.realpathSync(target);
	} catch {
		return path.normalize(target);
	}
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
 * `.agents/skills/<name>` points into the store when linked, and
 * `.claude/skills/<name>` points back at `.agents/skills/<name>` either way — so
 * a copied skill is still identifiable. A record on disk could drift from what
 * is actually there; a link cannot.
 */
function isOurs(root: string, name: string): boolean {
	if (linksTo(agentsPath(root, name), skillDir(name))) return true;
	return linksTo(claudePath(root, name), agentsPath(root, name));
}

export function ownedSkills(root: string): string[] {
	const dir = path.join(root, AGENTS_SKILLS);
	if (!fsu.exists(dir)) return [];

	return fs
		.readdirSync(dir)
		.filter((name) => !name.startsWith('.'))
		.filter((name) => isOurs(root, name))
		.sort();
}

function excludePatterns(names: string[]): string[] {
	return names.flatMap((name) => [`/${AGENTS_SKILLS}/${name}`, `/${CLAUDE_SKILLS}/${name}`]);
}

/** Symlinks where it can, copies where the platform will not allow it (Windows, mostly). */
function linkOrCopy(target: string, linkPath: string, fallback: () => void): void {
	fsu.ensureDir(path.dirname(linkPath));

	try {
		fs.symlinkSync(target, linkPath, 'dir');
	} catch {
		fallback();
	}
}

/**
 * Writes skills into a project.
 *
 * `link` points `.agents/skills/<name>` at the store so editing a skill in one
 * place changes it everywhere. `copy` writes real files, which is what a cloud
 * agent gets since it has no store to point at.
 *
 * `.claude/skills/<name>` is always a relative symlink into `.agents/skills`, so
 * a repo that already tracks its own `.claude/skills` keeps what it has.
 */
export function materialize(
	root: string,
	skills: Materializable[],
	opts: { copy: boolean }
): MaterializeResult {
	fsu.remove(path.join(root, LEGACY_MARKER));

	const written: string[] = [];
	const skipped: { name: string; reason: SkipReason }[] = [];

	for (const skill of skills) {
		const relAgents = `${AGENTS_SKILLS}/${skill.name}`;
		const relClaude = `${CLAUDE_SKILLS}/${skill.name}`;

		if (git.isTracked(root, relAgents) || git.isTracked(root, relClaude)) {
			skipped.push({ name: skill.name, reason: 'tracked' });
			continue;
		}

		const agents = agentsPath(root, skill.name);
		const claude = claudePath(root, skill.name);

		// something is already there that we did not put there
		if (fsu.exists(agents) && !isOurs(root, skill.name)) {
			skipped.push({ name: skill.name, reason: 'occupied' });
			continue;
		}

		fsu.remove(agents);
		fsu.remove(claude);

		if (opts.copy) {
			fsu.ensureDir(agents);
			for (const file of skill.files ?? []) {
				fsu.writeFile(path.join(agents, file.path), file.contents);
			}
		} else {
			const store = skillDir(skill.name);
			linkOrCopy(store, agents, () => fsu.copyDir(store, agents));
		}

		const relative = path.relative(path.dirname(claude), agents);
		linkOrCopy(relative, claude, () => fsu.copyDir(agents, claude));

		written.push(skill.name);
	}

	// drop the rule the marker used to need, for repos set up by an older version
	git.removeExcludes(root, [`/${LEGACY_MARKER}`]);
	git.addExcludes(root, excludePatterns(ownedSkills(root)));

	return { written, skipped };
}

export function unmaterialize(root: string, names: string[]): string[] {
	const removed: string[] = [];

	for (const name of names) {
		if (!isOurs(root, name)) continue;

		fsu.remove(agentsPath(root, name));
		fsu.remove(claudePath(root, name));
		removed.push(name);
	}

	git.removeExcludes(root, excludePatterns(removed));

	return removed;
}

/**
 * Drops links whose skill is gone from the store — what every other checkout is
 * left holding after `skilless delete` runs on one machine.
 */
export function prune(root: string): string[] {
	const dangling = ownedSkills(root).filter((name) => !fs.existsSync(agentsPath(root, name)));

	if (dangling.length === 0) return [];

	return unmaterialize(root, dangling);
}

/** The repo root, or the cwd when this is not a git repo at all. */
export function projectRoot(cwd: string): string {
	return git.repoRoot(cwd) ?? cwd;
}

export { writeSkill, SKILLS_DIR };
