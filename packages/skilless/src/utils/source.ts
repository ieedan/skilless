import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'pathe';
import { SkillessError } from '@/utils/errors';
import * as fsu from '@/utils/fs';
import { normalizeRemote } from '@/utils/git';
import { spin } from '@/utils/prompts';
import { isValidName, SKILL_FILE } from '@/utils/skill';

/** A git repository to pull skills out of. */
export type Source = {
	/** What `git clone` is handed. */
	url: string;
	/** Branch or tag. The default branch when absent. */
	ref?: string;
	/** Where in the repo to look, instead of the whole thing. */
	subpath?: string;
	/** From `owner/repo@skill` — the one skill wanted. */
	skill?: string;
	/** How to refer to it in output: `github.com/mattpocock/skills`. */
	label: string;
};

/**
 * Library skill names can never hold a `/` or a `:`, so any argument that does
 * names somewhere to fetch skills from rather than a skill you already have.
 */
export function isSource(arg: string): boolean {
	return arg.includes('/') || arg.includes(':');
}

/**
 * Reads the same shapes the `skills` CLI does:
 *
 * - `owner/repo`, `owner/repo/path/to/skills`, `owner/repo@skill` — GitHub
 * - `github:owner/repo`, `gitlab:group/repo`
 * - `https://github.com/owner/repo/tree/<ref>/<path>`
 * - `https://<gitlab host>/group/sub/repo/-/tree/<ref>/<path>`
 * - any other git URL — `https://…`, `git@host:path`, `ssh://…` — cloned as is
 *
 * A trailing `#<ref>` picks a branch or tag for any of them.
 */
export function parseSource(input: string): Source {
	let rest = input.trim();
	let ref: string | undefined;

	const hash = rest.indexOf('#');
	if (hash >= 0) {
		ref = rest.slice(hash + 1) || undefined;
		rest = rest.slice(0, hash);
	}

	if (/^ext::/i.test(rest)) {
		throw new SkillessError('The ext:: git transport is not supported.');
	}

	const prefixed = /^(github|gitlab):(.+)$/.exec(rest);
	if (prefixed) {
		rest = prefixed[1] === 'gitlab' ? `https://gitlab.com/${prefixed[2]}` : (prefixed[2] ?? '');
	}

	let source: Omit<Source, 'label'>;

	if (/^https?:\/\//i.test(rest)) {
		source = parseHttp(rest, ref);
	} else if (/^[a-z][a-z0-9+.-]*:\/\//i.test(rest) || /^[^@/\s]+@[^:/\s]+:/.test(rest)) {
		// ssh://, git://, file://, or scp-like git@host:path
		source = { url: rest, ref };
	} else {
		source = parseShorthand(rest, ref);
	}

	if (source.subpath) source.subpath = safeSubpath(source.subpath);

	return { ...source, label: normalizeRemote(source.url) ?? source.url };
}

function parseHttp(input: string, ref: string | undefined): Omit<Source, 'label'> {
	let url: URL;
	try {
		url = new URL(input);
	} catch {
		throw new SkillessError(`${input} is not a valid URL.`);
	}

	const segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
	const origin = `${url.protocol}//${url.host}`;

	if (url.hostname === 'github.com' && segments.length >= 2) {
		const [owner, repo, marker, treeRef, ...sub] = segments;
		const clone = `${origin}/${owner}/${repo?.replace(/\.git$/, '')}.git`;

		if ((marker === 'tree' || marker === 'blob') && treeRef) {
			return { url: clone, ref: treeRef, subpath: sub.join('/') || undefined };
		}

		return { url: clone, ref };
	}

	// GitLab, on gitlab.com or self hosted, marks the end of the repo path with `/-/`
	const dash = segments.indexOf('-');
	if (dash > 0 && segments[dash + 1] === 'tree' && segments[dash + 2]) {
		const repo = segments
			.slice(0, dash)
			.join('/')
			.replace(/\.git$/, '');
		return {
			url: `${origin}/${repo}.git`,
			ref: segments[dash + 2],
			subpath: segments.slice(dash + 3).join('/') || undefined
		};
	}

	return { url: input, ref };
}

function parseShorthand(input: string, ref: string | undefined): Omit<Source, 'label'> {
	const at = /^([^/@\s]+)\/([^/@\s]+)@([^/\s]+)$/.exec(input);
	if (at) {
		return { url: `https://github.com/${at[1]}/${at[2]}.git`, ref, skill: at[3] };
	}

	const match = /^([^/\s.][^/\s]*)\/([^/\s]+?)(?:\/(.+?))?\/?$/.exec(input);
	if (!match) {
		throw new SkillessError(`Can't tell where ${input} points.`, {
			suggestion: 'Pass `owner/repo` for GitHub, or a full git URL for anywhere else.'
		});
	}

	return {
		url: `https://github.com/${match[1]}/${match[2]?.replace(/\.git$/, '')}.git`,
		ref,
		subpath: match[3]
	};
}

function safeSubpath(subpath: string): string {
	const segments = subpath.replace(/\\/g, '/').split('/').filter(Boolean);

	if (segments.includes('..')) {
		throw new SkillessError(`${subpath} reaches outside the repository.`);
	}

	return segments.join('/');
}

/* ------------------------------------------------------------------ clone */

/**
 * Shallow clones a source into a temporary directory and hands it to `run`,
 * deleting it afterwards whatever happens.
 */
export async function withClone<T>(
	source: Source,
	run: (dir: string) => Promise<T>,
	opts: { interactive: boolean }
): Promise<T> {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skilless-'));

	try {
		const args = ['clone', '--depth', '1', '--quiet'];
		if (source.ref) args.push('--branch', source.ref);
		args.push('--', source.url, dir);

		try {
			await spin(`Cloning ${source.label}${source.ref ? `#${source.ref}` : ''}`, () =>
				clone(args, {
					...process.env,
					// fail rather than hang on a credential prompt — nobody could
					// answer it, or here, see it past the spinner
					GIT_TERMINAL_PROMPT: '0',
					GIT_SSH_COMMAND: process.env.GIT_SSH_COMMAND ?? 'ssh -o BatchMode=yes'
				})
			);
		} catch (e) {
			if (!opts.interactive) throw cloneError(source, e);

			// maybe it wanted credentials: go again, in the open, so git can ask
			fsu.remove(dir);
			fs.mkdirSync(dir);

			try {
				execFileSync('git', args, { stdio: ['inherit', 'ignore', 'pipe'], encoding: 'utf8' });
			} catch (retry) {
				throw cloneError(source, retry);
			}
		}

		return await run(dir);
	} finally {
		fsu.remove(dir);
	}
}

function clone(args: string[], env: NodeJS.ProcessEnv): Promise<void> {
	return new Promise((resolve, reject) => {
		execFile('git', args, { env, encoding: 'utf8' }, (error, _stdout, stderr) => {
			if (error) reject(Object.assign(error, { stderr }));
			else resolve();
		});
	});
}

function cloneError(source: Source, e: unknown): SkillessError {
	const stderr = (e as { stderr?: string }).stderr?.trim();
	return new SkillessError(`Couldn't clone ${source.label}.`, {
		suggestion: stderr || 'Check the address, and that you have access to the repository.',
		cause: e
	});
}

/* --------------------------------------------------------------- discover */

export type FoundSkill = {
	/** What it will be called in your library. */
	name: string;
	dir: string;
	description?: string;
};

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '__pycache__']);

/** Where repos conventionally keep skills, searched before anything else. */
const CONTAINERS = [
	'skills',
	'skills/.curated',
	'skills/.experimental',
	'skills/.system',
	'.agents/skills',
	'.claude/skills'
];

/**
 * Finds the skills in a checkout the way the `skills` CLI does: a `SKILL.md`
 * right at the search root is the one skill; otherwise the root and the usual
 * containers are searched a few levels down, and only if that finds nothing is
 * the whole tree walked.
 */
export function discoverSkills(root: string, subpath?: string): FoundSkill[] {
	const base = subpath ? path.join(root, subpath) : root;

	if (!fsu.exists(base)) {
		throw new SkillessError(`${subpath} does not exist in the repository.`);
	}

	const found = new Map<string, FoundSkill>();
	const add = (dir: string) => {
		const skill = describe(dir);
		if (!found.has(skill.name)) found.set(skill.name, skill);
	};

	if (hasSkill(base)) {
		add(base);
		return [...found.values()];
	}

	// the root is searched shallowly, so an `examples/foo/SKILL.md` stays out of it
	walk(base, 1, add);
	for (const container of CONTAINERS) walk(path.join(base, container), 3, add);

	if (found.size === 0) walk(base, 5, add);

	return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Finds a skill again in a fresh clone: where it was last time, or — if the
 * repo has been reorganised since — wherever a skill of the same name now is.
 */
export function locateSkill(
	root: string,
	recorded: string,
	name: string
): { dir: string; path: string } | null {
	try {
		const at = safeSubpath(recorded);
		if (hasSkill(path.join(root, at))) return { dir: path.join(root, at), path: at };
	} catch {
		// a path that leaves the repo is no path at all; search instead
	}

	const found = discoverSkills(root).find((skill) => skill.name === name);
	return found ? { dir: found.dir, path: path.relative(root, found.dir) } : null;
}

function hasSkill(dir: string): boolean {
	return fs.existsSync(path.join(dir, SKILL_FILE));
}

/** Calls `found` for each skill under `dir`, never descending into one. */
function walk(dir: string, depth: number, found: (dir: string) => void): void {
	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return;
	}

	for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
		if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) continue;

		const child = path.join(dir, entry.name);

		if (hasSkill(child)) found(child);
		else if (depth > 1) walk(child, depth - 1, found);
	}
}

/**
 * Names a skill by its frontmatter, since that is what its author calls it,
 * falling back to its directory when that name would not survive our library.
 */
function describe(dir: string): FoundSkill {
	const meta = frontmatter(fs.readFileSync(path.join(dir, SKILL_FILE), 'utf8'));
	const declared = meta.name?.toLowerCase().replace(/[\s_]+/g, '-');

	return {
		name: declared && isValidName(declared) ? declared : path.basename(dir).toLowerCase(),
		dir,
		description: meta.description
	};
}

/** Just enough YAML to read single line `name:` and `description:` fields. */
export function frontmatter(contents: string): { name?: string; description?: string } {
	const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(contents)?.[1];
	if (!block) return {};

	const field = (key: string) => {
		const value = new RegExp(`^${key}:[ \\t]*(.+)$`, 'm').exec(block)?.[1]?.trim();
		if (!value || value === '|' || value === '>') return undefined;
		return value.replace(/^(['"])(.*)\1$/, '$2');
	};

	return { name: field('name'), description: field('description') };
}
