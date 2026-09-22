import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'pathe';
import * as fsu from '@/utils/fs';

function git(args: string[], cwd: string): string | null {
	try {
		return execFileSync('git', args, {
			cwd,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore']
		}).trim();
	} catch {
		return null;
	}
}

export function repoRoot(cwd: string): string | null {
	const root = git(['rev-parse', '--show-toplevel'], cwd);
	return root ? path.normalize(root) : null;
}

export function remoteUrl(cwd: string): string | null {
	return git(['remote', 'get-url', 'origin'], cwd);
}

/**
 * Reduces a remote to a stable project key: `github.com/ieedan/layerchart`.
 *
 * SSH and HTTPS forms of the same repo must collapse to the same key, or a
 * cloud agent that clones over HTTPS won't find the skills you bound over SSH.
 */
export function normalizeRemote(url: string): string | null {
	let remaining = url.trim().replace(/\.git$/i, '');
	if (!remaining) return null;

	let host: string;
	let repoPath: string;

	// scp-like syntax: git@github.com:owner/repo
	const scp = /^(?:[^@/]+@)?([^/:]+):(.+)$/.exec(remaining);

	if (scp && !remaining.includes('://')) {
		host = scp[1] ?? '';
		repoPath = scp[2] ?? '';
	} else {
		if (!remaining.includes('://')) remaining = `https://${remaining}`;

		let parsed: URL;
		try {
			parsed = new URL(remaining);
		} catch {
			return null;
		}

		host = parsed.hostname;
		repoPath = parsed.pathname;
	}

	host = host.replace(/:\d+$/, '').toLowerCase();
	repoPath = repoPath.replace(/^\/+|\/+$/g, '').toLowerCase();

	if (!host || !repoPath) return null;

	return `${host}/${repoPath}`;
}

export function projectKey(cwd: string): string | null {
	const url = remoteUrl(cwd);
	if (!url) return null;
	return normalizeRemote(url);
}

/**
 * Inside a worktree `.git` is a file, not a directory, and `info/exclude` lives
 * in the common dir. Hardcoding `.git/info/exclude` silently writes nothing.
 */
export function gitCommonDir(cwd: string): string | null {
	const dir = git(['rev-parse', '--git-common-dir'], cwd);
	if (!dir) return null;

	return path.isAbsolute(dir) ? path.normalize(dir) : path.resolve(cwd, dir);
}

export function excludeFile(cwd: string): string | null {
	const common = gitCommonDir(cwd);
	if (!common) return null;

	return path.join(common, 'info', 'exclude');
}

/** True when git already tracks the path — we must never write over those. */
export function isTracked(cwd: string, relativePath: string): boolean {
	return git(['ls-files', '--error-unmatch', '--', relativePath], cwd) !== null;
}

/**
 * Adds local-only ignore rules. `.git/info/exclude` is never pushed and never
 * appears in `git status`, which is what keeps skills invisible in a repo that
 * isn't yours.
 */
export function addExcludes(cwd: string, patterns: string[]): boolean {
	const target = excludeFile(cwd);
	if (!target) return false;

	const existing = fsu.exists(target) ? fs.readFileSync(target, 'utf8') : '';
	const lines = new Set(
		existing
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean)
	);

	const missing = patterns.filter((pattern) => !lines.has(pattern));
	if (missing.length === 0) return true;

	const header = existing.includes('# skilless') ? '' : '\n# skilless\n';
	const suffix = existing.length > 0 && !existing.endsWith('\n') ? '\n' : '';

	fsu.ensureDir(path.dirname(target));
	fs.appendFileSync(target, `${suffix}${header}${missing.join('\n')}\n`, 'utf8');

	return true;
}

export function removeExcludes(cwd: string, patterns: string[]): void {
	const target = excludeFile(cwd);
	if (!target || !fsu.exists(target)) return;

	const drop = new Set(patterns);
	const kept = fs
		.readFileSync(target, 'utf8')
		.split('\n')
		.filter((line) => !drop.has(line.trim()));

	fs.writeFileSync(target, kept.join('\n'), 'utf8');
}
