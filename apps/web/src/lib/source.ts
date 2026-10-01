import { cliAddress, parseAddress, shortAddress } from '$lib/pack';
import { projectParts, type ProjectParts } from '$lib/project';

/**
 * `skills.source`: where a skill was copied from by `skilless add` — a repo,
 * or a skilless address — and the pack that last added it, if one did.
 */
export type SkillSource = {
	url: string;
	ref?: string;
	path: string;
	/** The upstream contentHash as of the last add or update. */
	hash?: string;
	pack?: { url: string; name?: string };
};

/** Where a skill came from, as its row and page show it. */
export type Origin =
	| { kind: 'pack'; label: string; href?: string }
	| { kind: 'skill'; label: string; href: string }
	| ({ kind: 'repo' } & SourceParts);

/** A link to somewhere on this site goes there directly, rather than out and back in. */
function local(url: string): string {
	try {
		const parsed = new URL(url.includes('://') ? url : `https://${url}`);
		return typeof location !== 'undefined' && parsed.origin === location.origin
			? parsed.pathname
			: parsed.href;
	} catch {
		return url;
	}
}

/**
 * The pack wins: a skill a pack added shows the pack, since that is how it
 * got here, even though updates come from the repo underneath.
 */
export function originOf(source: SkillSource): Origin | null {
	if (source.pack) {
		const { url, name } = source.pack;
		// a pack file on disk has no page to link to
		const remote = /^https?:\/\//i.test(url);
		return {
			kind: 'pack',
			label: name ?? shortAddress(url),
			href: remote ? local(url) : undefined
		};
	}

	const address = parseAddress(source.url);
	if (address?.kind === 'skill') {
		const href = source.url.startsWith('@')
			? `/skills/${address.username}/${address.name}`
			: local(source.url);
		return { kind: 'skill', label: cliAddress(address), href };
	}

	const parts = sourceParts(source);
	return parts && { kind: 'repo', ...parts };
}

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
