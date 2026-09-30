import type { GenericActionCtx } from 'convex/server';
import { v } from 'convex/values';
import { env } from '../env.convex';
import { internal } from './_generated/api';
import type { DataModel } from './_generated/dataModel';
import { internalAction, internalMutation } from './_generated/server';
import { createAuth } from './auth';
import { convexError, createConvexError } from './errors';
import { isGithubKey } from './model';
import { action, mutation, query, requireUser, secretAction } from './utils';

export type GithubRepo = {
	/** `owner/name` */
	fullName: string;
	private: boolean;
	defaultBranch: string;
	cloneUrl: string;
	description: string | null;
};

/**
 * A user-to-server token for the GitHub App. It only reaches repos the app is
 * installed on, and better-auth refreshes it when it has expired.
 */
async function githubToken(ctx: GenericActionCtx<DataModel>, userId: string): Promise<string> {
	try {
		const { accessToken } = await createAuth(ctx).api.getAccessToken({
			body: { providerId: 'github', userId }
		});
		if (accessToken) return accessToken;
	} catch {
		// no account, or the refresh token itself expired (after 6 months)
	}
	throw createConvexError(convexError.Unauthorized());
}

async function github<T>(token: string, path: string): Promise<T> {
	const response = await fetch(`https://api.github.com${path}`, {
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/vnd.github+json',
			'User-Agent': 'skilless',
			'X-GitHub-Api-Version': '2022-11-28'
		}
	});
	if (response.status === 401) throw createConvexError(convexError.Unauthorized());
	if (!response.ok) throw new Error(`GitHub ${path} responded ${response.status}`);
	return (await response.json()) as T;
}

type RawRepo = {
	full_name: string;
	private: boolean;
	default_branch: string;
	clone_url: string;
	description: string | null;
};

/** Every repo the user can reach through an installation of the app. */
async function listRepos(token: string): Promise<GithubRepo[]> {
	const repos: GithubRepo[] = [];

	// `/user/repos` with a GitHub App token is already scoped to installations
	for (let page = 1; ; page++) {
		const batch = await github<RawRepo[]>(
			token,
			`/user/repos?per_page=100&page=${page}&sort=pushed`
		);
		for (const repo of batch) {
			repos.push({
				fullName: repo.full_name,
				private: repo.private,
				defaultBranch: repo.default_branch,
				cloneUrl: repo.clone_url,
				description: repo.description?.trim() || null
			});
		}
		if (batch.length < 100) return repos;
	}
}

/** Where to send a user to grant the app access to more repos or orgs. */
const installUrl = `https://github.com/apps/${env.GITHUB_APP_SLUG}/installations/new`;

/**
 * A repo's GitHub description. Tries the user's token first so private repos the
 * app is installed on resolve, then falls back to an anonymous request for
 * public ones.
 *
 * `unreachable` means every attempt came back 404: the repo is private and not
 * shared with the app (or gone). Anything else that fails, a rate limit or a
 * network error, is just `found` with no description, since installing the app
 * would not fix it.
 */
async function describeRepo(
	token: string | null,
	path: string
): Promise<{ status: 'found'; description: string | null } | { status: 'unreachable' }> {
	let notFound = true;
	for (const auth of token ? [token, null] : [null]) {
		const response = await fetch(`https://api.github.com/repos/${path}`, {
			headers: {
				...(auth ? { Authorization: `Bearer ${auth}` } : {}),
				Accept: 'application/vnd.github+json',
				'User-Agent': 'skilless',
				'X-GitHub-Api-Version': '2022-11-28'
			}
		}).catch(() => null);
		if (response?.ok) {
			const repo = (await response.json()) as { description: string | null };
			return { status: 'found', description: repo.description?.trim() || null };
		}
		if (response?.status !== 404) notFound = false;
	}
	return notFound ? { status: 'unreachable' } : { status: 'found', description: null };
}

/* ---------------------------------------------------------------- website */

/** How long a cached description is trusted before a view of the project pages refreshes it. */
const REPO_TTL = 60 * 60 * 1000;

/** Where the project pages send a user to share a private repo. */
export const installLink = query({
	args: {},
	handler: async () => installUrl
});

/**
 * Queues a lookup of the user's GitHub projects that were never looked up or
 * have gone stale. The project list is live, so what it finds lands on the page
 * without a reload, and until then the page shows the cached copy.
 */
export const refreshStale = mutation({
	args: {},
	handler: async (ctx) => {
		const userId = await requireUser(ctx);
		const now = Date.now();

		const stale = (
			await ctx.db
				.query('projects')
				.withIndex('by_user', (q) => q.eq('userId', userId))
				.collect()
		).filter(
			(project) =>
				isGithubKey(project.key) && (!project.repo || now - project.repo.checkedAt > REPO_TTL)
		);

		if (stale.length === 0) return;
		await ctx.scheduler.runAfter(0, internal.github.refresh, {
			userId,
			projects: stale.map((project) => ({ id: project._id, key: project.key }))
		});
	}
});

/** Looks the projects up on GitHub and caches the result on each. Best effort per repo. */
export const refresh = internalAction({
	args: {
		userId: v.string(),
		projects: v.array(v.object({ id: v.id('projects'), key: v.string() }))
	},
	handler: async (ctx, args) => {
		let token: string | null = null;
		try {
			token = await githubToken(ctx, args.userId);
		} catch {
			// signed in some other way, or the refresh token expired
		}

		const repos = await Promise.all(
			args.projects.map(async ({ id, key }) => {
				const result = await describeRepo(token, key.slice('github.com/'.length));
				return {
					id,
					description: result.status === 'found' ? result.description : null,
					reachable: result.status === 'found'
				};
			})
		);

		await ctx.runMutation(internal.github.saveRepos, { repos });
	}
});

export const saveRepos = internalMutation({
	args: {
		repos: v.array(
			v.object({
				id: v.id('projects'),
				description: v.union(v.string(), v.null()),
				reachable: v.boolean()
			})
		)
	},
	handler: async (ctx, args) => {
		const checkedAt = Date.now();
		for (const { id, description, reachable } of args.repos) {
			// the project may have been deleted while GitHub was answering
			if (await ctx.db.get(id)) {
				await ctx.db.patch(id, { repo: { description, reachable, checkedAt } });
			}
		}
	}
});

/**
 * Whether the user has installed the app on any account, checked after sign-in
 * so a new user is sent to pick repos before they find private ones missing.
 * Signing in only authorizes the app; installing it is a separate step GitHub
 * never prompts for on its own.
 */
export const installation = action({
	args: {},
	handler: async (ctx): Promise<{ installed: boolean; installUrl: string }> => {
		const token = await githubToken(ctx, await requireUser(ctx));
		const { total_count } = await github<{ total_count: number }>(
			token,
			'/user/installations?per_page=1'
		);
		return { installed: total_count > 0, installUrl };
	}
});

/** A repo as the project pickers list it: a project key, whether or not it is a project yet. */
const repoKey = (fullName: string) => `github.com/${fullName.toLowerCase()}`;

/**
 * The user's cached GitHub repos. `syncedAt` is null until the first lookup
 * settles, and `syncing` is true while one is in flight.
 */
export const cachedRepos = query({
	args: {},
	handler: async (ctx) => {
		const user = await ctx.auth.getUserIdentity();
		if (!user) return { repos: [], syncedAt: null, syncing: false };

		const [repos, sync] = await Promise.all([
			ctx.db
				.query('repos')
				.withIndex('by_user', (q) => q.eq('userId', user.subject))
				.collect(),
			ctx.db
				.query('repoSyncs')
				.withIndex('by_user', (q) => q.eq('userId', user.subject))
				.unique()
		]);

		return {
			repos: repos
				.map(({ key, description }) => ({ key, description }))
				.sort((a, b) => a.key.localeCompare(b.key)),
			syncedAt: sync?.syncedAt ?? null,
			syncing: sync?.requestedAt !== undefined
		};
	}
});

/** How long a search waits after the last lookup before asking GitHub again. */
const RESYNC_MS = 30 * 1000;
/** A lookup still marked in flight after this is assumed lost, and may be queued again. */
const LOST_MS = 2 * 60 * 1000;

/**
 * Queues a lookup of the user's repos on GitHub. Without `force` it only runs
 * the first time, to fill the cache; after that the pickers read the cache and
 * only a search forces a fresh look, in case the repo is newer than it.
 */
export const syncRepos = mutation({
	args: { force: v.boolean() },
	handler: async (ctx, args) => {
		const userId = await requireUser(ctx);
		const now = Date.now();

		const sync = await ctx.db
			.query('repoSyncs')
			.withIndex('by_user', (q) => q.eq('userId', userId))
			.unique();

		if (sync?.requestedAt !== undefined && now - sync.requestedAt < LOST_MS) return;
		if (sync?.syncedAt !== undefined && (!args.force || now - sync.syncedAt < RESYNC_MS)) return;

		if (sync) await ctx.db.patch(sync._id, { requestedAt: now });
		else await ctx.db.insert('repoSyncs', { userId, requestedAt: now });

		await ctx.scheduler.runAfter(0, internal.github.fetchRepos, { userId });
	}
});

export const fetchRepos = internalAction({
	args: { userId: v.string() },
	handler: async (ctx, args) => {
		let repos: GithubRepo[] | null = null;
		try {
			repos = await listRepos(await githubToken(ctx, args.userId));
		} catch {
			// signed in some other way, or GitHub is having a moment. The cache stands.
		}

		await ctx.runMutation(internal.github.saveRepoList, {
			userId: args.userId,
			repos:
				repos?.map((repo) => ({
					key: repoKey(repo.fullName),
					description: repo.description,
					private: repo.private
				})) ?? null
		});
	}
});

/** Replaces the user's cached repos with GitHub's list, or with `null` just ends the lookup. */
export const saveRepoList = internalMutation({
	args: {
		userId: v.string(),
		repos: v.union(
			v.array(
				v.object({
					key: v.string(),
					description: v.union(v.string(), v.null()),
					private: v.boolean()
				})
			),
			v.null()
		)
	},
	handler: async (ctx, args) => {
		const now = Date.now();

		if (args.repos) {
			const existing = await ctx.db
				.query('repos')
				.withIndex('by_user', (q) => q.eq('userId', args.userId))
				.collect();
			const byKey = new Map(existing.map((row) => [row.key, row]));

			for (const repo of args.repos) {
				const row = byKey.get(repo.key);
				byKey.delete(repo.key);
				if (!row) {
					await ctx.db.insert('repos', { userId: args.userId, ...repo });
				} else if (row.description !== repo.description || row.private !== repo.private) {
					await ctx.db.patch(row._id, { description: repo.description, private: repo.private });
				}
			}

			// no longer shared with the app, or gone
			for (const row of byKey.values()) await ctx.db.delete(row._id);
		}

		const sync = await ctx.db
			.query('repoSyncs')
			.withIndex('by_user', (q) => q.eq('userId', args.userId))
			.unique();

		// a failed first lookup still counts, so opening a picker does not retry it
		// every time; a search will
		const syncedAt = args.repos ? now : (sync?.syncedAt ?? now);
		if (sync) await ctx.db.patch(sync._id, { syncedAt, requestedAt: undefined });
		else await ctx.db.insert('repoSyncs', { userId: args.userId, syncedAt });
	}
});

/* -------------------------------------------------------------------- api */

export const reposFor = secretAction({
	args: { userId: v.string() },
	handler: async (ctx, args): Promise<{ repos: GithubRepo[]; installUrl: string }> => {
		return { repos: await listRepos(await githubToken(ctx, args.userId)), installUrl };
	}
});

/**
 * A short lived token for cloning a private repo as the user, used as
 * `https://x-access-token:<token>@github.com/<owner>/<repo>.git`.
 */
export const cloneTokenFor = secretAction({
	args: { userId: v.string() },
	handler: async (ctx, args): Promise<{ token: string; installUrl: string }> => {
		return { token: await githubToken(ctx, args.userId), installUrl };
	}
});
