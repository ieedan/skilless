import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { internalMutation, internalQuery } from './_generated/server';
import { skillName, skillsAt } from './discover';
import { githubToken } from './github';
import { githubEntry, isGithubKey, parseFrontmatter, snapshotCount } from './model';
import { action, query, requireUser } from './utils';

/*
 * Reading GitHub repos for skills without cloning them: the tree for every
 * SKILL.md, then each one's frontmatter in a single GraphQL request. Cached per
 * user in `repoScans`, so the pickers and pack pages read them straight off.
 */

/** How long a scan is trusted before a picker or pack page looks again. */
const SCAN_TTL = 60 * 60 * 1000;
/** Most repos one call scans; the pickers ask for what is on screen. */
const MAX_KEYS = 30;
/** Most SKILL.md files read per repo. Past this, skills are named by their directory. */
const MAX_FRONTMATTER = 300;
const BATCH = 60;

type Scan = Omit<Doc<'repoScans'>, '_id' | '_creationTime' | 'userId' | 'scannedAt'>;

function headers(token: string | null) {
	return {
		...(token ? { Authorization: `Bearer ${token}` } : {}),
		Accept: 'application/vnd.github+json',
		'User-Agent': 'skilless',
		'X-GitHub-Api-Version': '2022-11-28'
	};
}

/** Tries the user's token, for private repos the app can reach, then anonymously for public ones. */
async function get<T>(
	tokens: (string | null)[],
	path: string
): Promise<{ data: T; token: string | null } | null> {
	for (const token of tokens) {
		const response = await fetch(`https://api.github.com${path}`, {
			headers: headers(token)
		}).catch(() => null);
		if (response?.ok) return { data: (await response.json()) as T, token };
	}
	return null;
}

/**
 * Files' contents at `branch`, by GraphQL in batches with a token, or raw for a
 * public repo without one. Null for a binary file; missing where it could not
 * be read.
 */
export async function readFiles(
	token: string | null,
	owner: string,
	name: string,
	branch: string,
	paths: string[]
): Promise<Map<string, string | null>> {
	const contents = new Map<string, string | null>();

	if (!token) {
		// GraphQL needs a token; a public repo's raw files do not
		await Promise.all(
			paths.map(async (path) => {
				const response = await fetch(
					`https://raw.githubusercontent.com/${owner}/${name}/${encodeURIComponent(branch)}/${path.split('/').map(encodeURIComponent).join('/')}`
				).catch(() => null);
				if (!response?.ok) return;
				const bytes = new Uint8Array(await response.arrayBuffer());
				contents.set(path, bytes.includes(0) ? null : new TextDecoder().decode(bytes));
			})
		);
		return contents;
	}

	for (let start = 0; start < paths.length; start += BATCH) {
		const batch = paths.slice(start, start + BATCH);
		const fields = batch
			.map(
				(path, i) =>
					`f${i}: object(expression: ${JSON.stringify(`${branch}:${path}`)}) { ... on Blob { text isBinary } }`
			)
			.join('\n');
		const response = await fetch('https://api.github.com/graphql', {
			method: 'POST',
			headers: { ...headers(token), 'Content-Type': 'application/json' },
			body: JSON.stringify({
				query: `query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { ${fields} } }`,
				variables: { owner, name }
			})
		}).catch(() => null);
		if (!response?.ok) continue;

		const json = (await response.json()) as {
			data?: { repository?: Record<string, { text?: string | null; isBinary?: boolean } | null> };
		};
		batch.forEach((path, i) => {
			const blob = json.data?.repository?.[`f${i}`];
			if (blob?.isBinary) contents.set(path, null);
			else if (typeof blob?.text === 'string') contents.set(path, blob.text);
		});
	}

	return contents;
}

/**
 * One file's bytes, for a binary file the text reads skip: through the API with
 * a token, so private repos work, or raw for a public one. Null if unreadable.
 */
export async function readBytes(
	token: string | null,
	owner: string,
	name: string,
	branch: string,
	path: string
): Promise<Uint8Array | null> {
	const encoded = path.split('/').map(encodeURIComponent).join('/');
	const response = await fetch(
		token
			? `https://api.github.com/repos/${owner}/${name}/contents/${encoded}?ref=${encodeURIComponent(branch)}`
			: `https://raw.githubusercontent.com/${owner}/${name}/${encodeURIComponent(branch)}/${encoded}`,
		{ headers: token ? { ...headers(token), Accept: 'application/vnd.github.raw' } : {} }
	).catch(() => null);
	if (!response?.ok) return null;
	return new Uint8Array(await response.arrayBuffer());
}

/** Each SKILL.md's contents, by its directory. */
async function readSkillFiles(
	token: string | null,
	owner: string,
	name: string,
	branch: string,
	dirs: string[]
): Promise<Map<string, string>> {
	const file = (dir: string) => (dir ? `${dir}/SKILL.md` : 'SKILL.md');
	const read = await readFiles(token, owner, name, branch, dirs.map(file));

	const contents = new Map<string, string>();
	for (const dir of dirs) {
		const text = read.get(file(dir));
		if (typeof text === 'string') contents.set(dir, text);
	}
	return contents;
}

export type RepoTree = {
	token: string | null;
	owner: string;
	name: string;
	branch: string;
	description: string | null;
	private: boolean;
	blobs: { path: string; size: number }[];
};

/** A repo's default branch and every file on it, with whichever token reaches it. */
export async function readTree(token: string | null, key: string): Promise<RepoTree | null> {
	const [owner = '', name = ''] = key.slice('github.com/'.length).split('/');
	const tokens = token ? [token, null] : [null];

	const repo = await get<{ description: string | null; private: boolean; default_branch: string }>(
		tokens,
		`/repos/${owner}/${name}`
	);
	if (!repo) return null;

	const branch = repo.data.default_branch;
	// whichever token reached the repo reaches its tree
	const tree = await get<{ tree: { path: string; type: string; size?: number }[] }>(
		[repo.token],
		`/repos/${owner}/${name}/git/trees/${encodeURIComponent(branch)}?recursive=1`
	);

	return {
		token: repo.token,
		owner,
		name,
		branch,
		description: repo.data.description?.trim() || null,
		private: repo.data.private,
		blobs: (tree?.data.tree ?? [])
			.filter((entry) => entry.type === 'blob')
			.map((entry) => ({ path: entry.path, size: entry.size ?? 0 }))
	};
}

/** The directories holding a SKILL.md. */
export function skillDirs(blobs: { path: string }[]): string[] {
	return blobs
		.filter((entry) => entry.path === 'SKILL.md' || entry.path.endsWith('/SKILL.md'))
		.map((entry) => entry.path.slice(0, -'SKILL.md'.length).replace(/\/$/, ''));
}

async function scanRepo(token: string | null, key: string): Promise<Scan> {
	const missing: Scan = { key, found: false, private: false, description: null, skills: [] };

	const repo = await readTree(token, key);
	if (!repo) return missing;

	const { blobs } = repo;
	const dirs = skillDirs(blobs);

	const contents = await readSkillFiles(
		repo.token,
		repo.owner,
		repo.name,
		repo.branch,
		dirs.slice(0, MAX_FRONTMATTER)
	);

	return {
		key,
		found: true,
		private: repo.private,
		description: repo.description,
		skills: dirs.map((dir) => {
			const meta = parseFrontmatter(contents.get(dir) ?? '');
			const files = dir ? blobs.filter((b) => b.path.startsWith(`${dir}/`)).length : blobs.length;
			return {
				dir,
				name: skillName(dir, meta.title),
				...(meta.description ? { description: meta.description } : {}),
				...(files === 1 ? { sole: true } : {})
			};
		})
	};
}

/* ---------------------------------------------------------------- website */

/**
 * Scans the repos that were never scanned, or not lately. Results land in
 * `repoScans`, which the pickers and pack pages read live.
 */
export const scan = action({
	args: { keys: v.array(v.string()), force: v.optional(v.boolean()) },
	handler: async (ctx, args): Promise<void> => {
		const userId = await requireUser(ctx);
		const keys = [...new Set(args.keys.map((key) => key.toLowerCase()))]
			.filter((key) => isGithubKey(key) && key.split('/').length === 3)
			.slice(0, MAX_KEYS);
		if (keys.length === 0) return;

		const stale = args.force
			? keys
			: await ctx.runQuery(internal.scans.stale, { userId, keys, ttl: SCAN_TTL });
		if (stale.length === 0) return;

		let token: string | null = null;
		try {
			token = await githubToken(ctx, userId);
		} catch {
			// signed in some other way, or the refresh token expired: public repos still work
		}

		const scans = await Promise.all(stale.map((key) => scanRepo(token, key)));
		await ctx.runMutation(internal.scans.save, { userId, scans });
	}
});

/** What the user has scanned of these repos. */
export const forKeys = query({
	args: { keys: v.array(v.string()) },
	handler: async (ctx, args) => {
		const user = await ctx.auth.getUserIdentity();
		if (!user) return [];

		const rows = await Promise.all(
			[...new Set(args.keys.map((key) => key.toLowerCase()))].map((key) =>
				ctx.db
					.query('repoScans')
					.withIndex('by_user_and_key', (q) => q.eq('userId', user.subject).eq('key', key))
					.unique()
			)
		);

		return rows.flatMap((row) => (row ? [summarize(row)] : []));
	}
});

/** A scan as the website shows it: the skills `skilless add <repo>` would take. */
export function summarize(row: Doc<'repoScans'>) {
	return {
		key: row.key,
		found: row.found,
		private: row.private,
		description: row.description,
		skills: skillsAt(row.skills, ''),
		scannedAt: row.scannedAt
	};
}

/* --------------------------------------------------------------- internal */

export const stale = internalQuery({
	args: { userId: v.string(), keys: v.array(v.string()), ttl: v.number() },
	handler: async (ctx, args): Promise<string[]> => {
		const now = Date.now();
		const stale: string[] = [];
		for (const key of args.keys) {
			const row = await ctx.db
				.query('repoScans')
				.withIndex('by_user_and_key', (q) => q.eq('userId', args.userId).eq('key', key))
				.unique();
			if (!row || now - row.scannedAt > args.ttl) stale.push(key);
		}
		return stale;
	}
});

export const save = internalMutation({
	args: {
		userId: v.string(),
		scans: v.array(
			v.object({
				key: v.string(),
				found: v.boolean(),
				private: v.boolean(),
				description: v.union(v.string(), v.null()),
				skills: v.array(
					v.object({
						dir: v.string(),
						name: v.string(),
						description: v.optional(v.string()),
						sole: v.optional(v.boolean())
					})
				)
			})
		)
	},
	handler: async (ctx, args) => {
		const scannedAt = Date.now();
		for (const scan of args.scans) {
			const row = await ctx.db
				.query('repoScans')
				.withIndex('by_user_and_key', (q) => q.eq('userId', args.userId).eq('key', scan.key))
				.unique();
			if (row) await ctx.db.patch(row._id, { ...scan, scannedAt });
			else await ctx.db.insert('repoScans', { userId: args.userId, ...scan, scannedAt });
		}

		// the user's packs pointing into these repos count their skills again
		const keys = new Set(args.scans.map((scan) => scan.key));
		const packs = await ctx.db
			.query('packs')
			.withIndex('by_user', (q) => q.eq('userId', args.userId))
			.collect();
		for (const pack of packs) {
			if (pack.skills.some((entry) => keys.has(githubEntry(entry)?.key ?? ''))) {
				await snapshotCount(ctx, pack);
			}
		}
	}
});
