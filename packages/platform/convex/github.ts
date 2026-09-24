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

export const repos = action({
	args: {},
	handler: async (ctx): Promise<{ repos: GithubRepo[]; installUrl: string }> => {
		const userId = await requireUser(ctx);
		return { repos: await listRepos(await githubToken(ctx, userId)), installUrl };
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
