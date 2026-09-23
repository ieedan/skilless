import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'pathe';
import { SkillessError } from '@/utils/errors';
import * as fsu from '@/utils/fs';
import { SKILLS_DIR, skillDir } from '@/utils/paths';
import type { LocalSkill, SkillFile } from '@/utils/types';

export const SKILL_FILE = 'SKILL.md';

/** Skills are prose. Anything near this is a mistake, and the API rejects it too. */
export const MAX_SKILL_BYTES = 1024 * 1024;

const IGNORED = new Set(['.git', 'node_modules', '.DS_Store', '.skilless.json']);

const NAME_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

function ignored(name: string): boolean {
	return IGNORED.has(name);
}

export function isValidName(name: string): boolean {
	return name.length <= 64 && NAME_PATTERN.test(name);
}

export function assertValidName(name: string): void {
	if (isValidName(name)) return;

	throw new SkillessError(`${name} is not a valid skill name.`, {
		suggestion:
			'Use lowercase letters, digits, dots, dashes and underscores, starting with a letter or digit.'
	});
}

/**
 * Hashes the sorted (path, contents) pairs. Both sides of a sync compute this the
 * same way, so an equal hash means equal content regardless of mtime — which is
 * what keeps a `git checkout` or a file copy from looking like an edit.
 */
export function hashFiles(files: SkillFile[]): string {
	const hash = crypto.createHash('sha256');

	for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
		hash.update(file.path);
		hash.update('\0');
		hash.update(file.contents);
		hash.update('\0');
	}

	return hash.digest('hex');
}

/** Reads a skill directory. Throws if it isn't one, or holds something we can't sync. */
export function readSkill(dir: string, name: string): LocalSkill {
	if (!fsu.exists(path.join(dir, SKILL_FILE))) {
		throw new SkillessError(`${name} has no ${SKILL_FILE}.`, {
			suggestion: `Every skill needs a ${SKILL_FILE} at its root.`
		});
	}

	const relative = fsu.walk(dir, ignored);
	const files: SkillFile[] = [];
	let editedAt = 0;
	let bytes = 0;

	for (const rel of relative) {
		const abs = path.join(dir, rel);
		const buffer = fs.readFileSync(abs);

		if (buffer.includes(0)) {
			throw new SkillessError(`${name}/${rel} looks like a binary file.`, {
				suggestion: 'v0 syncs text only. Remove the file or keep it outside the skill.'
			});
		}

		bytes += buffer.byteLength;
		if (bytes > MAX_SKILL_BYTES) {
			throw new SkillessError(`${name} is larger than 1MB.`, {
				suggestion: 'Skills are prose. Move large assets out of the skill directory.'
			});
		}

		files.push({ path: rel, contents: buffer.toString('utf8') });
		editedAt = Math.max(editedAt, fs.statSync(abs).mtimeMs);
	}

	return { name, dir, files, contentHash: hashFiles(files), editedAt };
}

/** Replaces a skill's directory with exactly these files. */
export function writeSkill(name: string, files: SkillFile[], editedAt?: number): void {
	const dir = skillDir(name);

	fsu.remove(dir);
	fsu.ensureDir(dir);

	for (const file of files) {
		fsu.writeFile(path.join(dir, file.path), file.contents);
	}

	// keep mtimes in step with the source of truth so the next sync doesn't
	// mistake a freshly pulled skill for a local edit
	if (editedAt !== undefined) {
		const when = new Date(editedAt);
		for (const file of files) fs.utimesSync(path.join(dir, file.path), when, when);
	}
}

export function localSkillNames(): string[] {
	if (!fsu.exists(SKILLS_DIR)) return [];

	return fs
		.readdirSync(SKILLS_DIR, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && !ignored(entry.name))
		.map((entry) => entry.name)
		.sort();
}

export function listLocalSkills(): LocalSkill[] {
	return localSkillNames().map((name) => readSkill(skillDir(name), name));
}

export function findLocalSkill(name: string): LocalSkill | null {
	const dir = skillDir(name);
	if (!fsu.exists(dir)) return null;
	return readSkill(dir, name);
}

export function scaffold(name: string, description: string): SkillFile[] {
	return [
		{
			path: SKILL_FILE,
			contents: `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n\nDescribe what this skill does and when an agent should reach for it.\n`
		}
	];
}
