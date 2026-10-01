/*
 * Pack entries, as written in a pack file: `github.com/owner/repo/path#ref`,
 * a GitHub or GitLab URL, or a skilless address: `https://skilless.dev/skills/<user>/<skill>`,
 * `https://skilless.dev/packs/<user>/<slug>`, or the CLI's `@user/skill` and `@user/pack/<slug>`.
 * The CLI is what resolves them; this only reads them well enough to show.
 */

export type EntryParts = {
	host: 'github' | 'gitlab' | 'skilless' | 'other';
	/** `owner/repo/path` for a repository, the address otherwise. */
	label: string;
	ref?: string;
	/** Where to look at it in a browser. */
	href?: string;
};

/** Something on skilless, as an address names it. */
export type Address =
	| { kind: 'skill'; username: string; name: string }
	| { kind: 'pack'; username: string; slug: string };

/**
 * Reads a skilless address however it is written, as the platform's
 * `parseAddress` does: `@user/skill`, `@user/pack/<slug>`, or a page or its JSON
 * on any host. Null for anything else, a repository included.
 */
export function parseAddress(entry: string): Address | null {
	const raw = entry.trim().split('#')[0]!.replace(/\/+$/, '');

	const at = /^@([a-z\d][a-z\d-]*)\/(?:pack\/([^/\s]+)|([^/\s]+))$/i.exec(raw);
	if (at) {
		const username = at[1]!.toLowerCase();
		return at[2]
			? { kind: 'pack', username, slug: at[2].toLowerCase() }
			: { kind: 'skill', username, name: at[3]!.toLowerCase() };
	}

	const url =
		/^(?:https?:\/\/)?([^/\s]+)\/(skills|packs)\/([a-z\d][a-z\d-]*)\/([^/\s]+?)(?:\.json)?$/i.exec(
			raw
		);
	if (!url) return null;
	const host = url[1]!.toLowerCase();
	if (!/[.:]/.test(host) || host === 'github.com' || host === 'www.github.com') return null;

	const username = url[3]!.toLowerCase();
	const tail = url[4]!.toLowerCase();
	return url[2]!.toLowerCase() === 'skills'
		? { kind: 'skill', username, name: tail }
		: { kind: 'pack', username, slug: tail };
}

/** Whether two entries name the same skill or pack on skilless, however each was written. */
export function sameAddress(a: string, b: string): boolean {
	const x = parseAddress(a);
	const y = parseAddress(b);
	if (!x || !y || x.kind !== y.kind || x.username !== y.username) return false;
	return x.kind === 'skill'
		? x.name === (y as typeof x).name
		: x.slug === (y as Extract<Address, { kind: 'pack' }>).slug;
}

/** How a skill's address reads in a pack: the full URL, so it works pasted anywhere. */
export function skillAddress(origin: string, username: string, name: string): string {
	return `${origin}/skills/${username}/${name}`;
}

/** A pack's page. The CLI reads the JSON beside it at `.json`, so the page's URL is all anyone needs. */
export function packAddress(origin: string, username: string, slug: string): string {
	return `${origin}/packs/${username}/${slug}`;
}

/** What to type after `skilless add`: `@user/skill`, or `@user/pack/<slug>`. */
export function cliAddress(address: Address): string {
	return address.kind === 'skill'
		? `@${address.username}/${address.name}`
		: `@${address.username}/pack/${address.slug}`;
}

/** An address as typed after `skilless add`: no `https://`, which the CLI assumes. */
export function shortAddress(url: string): string {
	return url.replace(/^https:\/\//, '');
}

export function entryParts(entry: string): EntryParts {
	let rest = entry.trim();
	let ref: string | undefined;

	const hash = rest.indexOf('#');
	if (hash >= 0) {
		ref = rest.slice(hash + 1) || undefined;
		rest = rest.slice(0, hash);
	}

	const address = parseAddress(rest);
	if (address) {
		const path =
			address.kind === 'skill'
				? `/skills/${address.username}/${address.name}`
				: `/packs/${address.username}/${address.slug}`;
		return {
			host: 'skilless',
			label: cliAddress(address),
			// `@user/...` names this site; a URL keeps its own host
			href: rest.startsWith('@') ? path : rest.includes('://') ? rest : `https://${rest}`
		};
	}

	const bare = rest.replace(/^[a-z]+:\/\//i, '').replace(/\/+$/, '');
	const [hostname = '', ...segments] = bare.split('/');

	// `owner/repo` with no host is GitHub, as it is to the CLI
	const github = hostname === 'github.com' || (!hostname.includes('.') && !rest.includes('://'));
	const parts = github && hostname !== 'github.com' ? [hostname, ...segments] : segments;

	if (github && parts.length >= 2) {
		const [owner, repo, marker, treeRef, ...sub] = parts;
		const path = (marker === 'tree' || marker === 'blob') && treeRef ? sub : parts.slice(2);
		const at = ref ?? ((marker === 'tree' || marker === 'blob') && treeRef ? treeRef : undefined);
		const tail = path.length ? `/${path.join('/')}` : '';

		return {
			host: 'github',
			label: `${owner}/${repo?.replace(/\.git$/, '')}${tail}`,
			ref: at,
			href: `https://github.com/${owner}/${repo?.replace(/\.git$/, '')}/tree/${encodeURIComponent(at ?? 'HEAD')}${tail}`
		};
	}

	if (hostname.includes('gitlab')) {
		return {
			host: 'gitlab',
			label: segments.join('/').replace('/-/tree/', '/'),
			ref,
			href: rest.includes('://') ? rest : `https://${bare}`
		};
	}

	return {
		host: 'other',
		label: bare,
		ref,
		href: rest.includes('://') ? rest : hostname.includes('.') ? `https://${bare}` : undefined
	};
}

/**
 * Where an entry points on GitHub, as a repo key and a path in it — the same
 * reading as the platform's `githubEntry`, so a picker can tell which entries
 * it already has however they were written. Null for anything else.
 */
export function githubEntry(entry: string): { key: string; subpath: string } | null {
	const rest = entry
		.trim()
		.split('#')[0]!
		.replace(/^https?:\/\//i, '')
		.replace(/\/+$/, '');
	let segments = rest.split('/').filter(Boolean);

	if (segments[0]?.toLowerCase() === 'github.com') segments = segments.slice(1);
	else if (segments[0]?.includes('.') || segments[0]?.includes(':')) return null;

	const [owner, repo, marker, ref, ...tail] = segments;
	if (!owner || !repo) return null;

	const sub = (marker === 'tree' || marker === 'blob') && ref ? tail : segments.slice(2);
	return {
		key: `github.com/${owner}/${repo.replace(/\.git$/i, '')}`.toLowerCase(),
		subpath: sub.join('/')
	};
}

/** The entry for a repo, or one directory in it: `github.com/owner/repo/dir`. */
export function repoEntry(key: string, dir = ''): string {
	return dir ? `${key}/${dir}` : key;
}

/**
 * A GitHub repo key from what someone typed into a search: `owner/repo`,
 * `github.com/owner/repo`, or a GitHub URL. Null when it is none of those.
 */
export function typedRepoKey(query: string): string | null {
	const typed = query.trim();
	if (!/^(https?:\/\/)?(github\.com\/)?[\w.-]+\/[\w.-]+/i.test(typed)) return null;
	const found = githubEntry(typed);
	return found && /^github\.com\/[\w-]+\/[\w.-]+$/.test(found.key) ? found.key : null;
}

/** A pack's skill count as lists show it: `12 skills`, or `12+ skills` while a repo is still to be scanned. */
export function skillCount(pack: {
	skillCount?: number;
	countPartial?: boolean;
	skills: string[];
}) {
	const n = pack.skillCount ?? pack.skills.length;
	const partial = pack.skillCount === undefined || pack.countPartial === true;
	return `${n}${partial && n > 0 ? '+' : ''} ${n === 1 && !partial ? 'skill' : 'skills'}`;
}

/**
 * Where to look at a skill that is a single SKILL.md: the file itself, not a
 * folder holding only it. `href` is a GitHub `/tree/` or GitLab `/-/tree/` link
 * to the folder.
 */
export function fileHref(href: string, file = 'SKILL.md'): string {
	return `${href.replace(/\/(-\/)?tree\//, (_, dash) => `/${dash ?? ''}blob/`).replace(/\/$/, '')}/${file}`;
}
