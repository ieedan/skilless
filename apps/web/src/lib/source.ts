import { projectParts, type ProjectParts } from '$lib/project';

/** `skills.source`: the repo a skill was copied from by `skilless add <repo>`. */
export type SkillSource = { url: string; ref?: string; path: string };

export type SourceParts = ProjectParts & {
	/** Where the skill lives upstream, when the host has a web view we can link to. */
	href?: string;
};

/**
 * Splits a source into what the skill list and page show. The url is whatever
 * `skilless add` was given, so it is normalized the same way the CLI's
 * `normalizeRemote` does it: `github.com/owner/repo`.
 */
export function sourceParts(source: SkillSource): SourceParts | null {
	const key = normalizeRemote(source.url);
	if (!key) return null;

	const parts = projectParts(key);
	const hostname = key.slice(0, key.length - parts.path.length - 1);

	// HEAD resolves to the default branch on both hosts, for a source with no ref
	const ref = encodeURIComponent(source.ref ?? 'HEAD');
	const tail = source.path ? `/${ref}/${source.path}` : `/${ref}`;

	const href =
		parts.host === 'github'
			? `https://${hostname}/${parts.path}/tree${tail}`
			: parts.host === 'gitlab'
				? `https://${hostname}/${parts.path}/-/tree${tail}`
				: /^https?:\/\//i.test(source.url)
					? `https://${key}`
					: undefined;

	return { ...parts, href };
}

function normalizeRemote(url: string): string | null {
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

		try {
			const parsed = new URL(remaining);
			host = parsed.hostname;
			repoPath = parsed.pathname;
		} catch {
			return null;
		}
	}

	host = host.replace(/:\d+$/, '').toLowerCase();
	repoPath = repoPath.replace(/^\/+|\/+$/g, '').toLowerCase();

	if (!host || !repoPath) return null;

	return `${host}/${repoPath}`;
}
