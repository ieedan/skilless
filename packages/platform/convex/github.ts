import type { GenericActionCtx } from 'convex/server';
import { v } from 'convex/values';
import { env } from '../env.convex';
import type { DataModel } from './_generated/dataModel';
import { createAuth } from './auth';
import { convexError, createConvexError } from './errors';
import { action, requireUser, secretAction } from './utils';

export type GithubRepo = {
	/** `owner/name` */
	fullName: string;
	private: boolean;
	defaultBranch: string;
	cloneUrl: string;
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
				cloneUrl: repo.clone_url
			});
		}
		if (batch.length < 100) return repos;
	}
}

/** Where to send a user to grant the app access to more repos or orgs. */
const installUrl = `https://github.com/apps/${env.GITHUB_APP_SLUG}/installations/new`;

/**
 * A repo's GitHub description, or null when it has none or cannot be read. Tries
 * the user's token first so private repos the app is installed on resolve, then
 * falls back to an anonymous request for public ones.
 */
async function describeRepo(token: string | null, path: string): Promise<string | null> {
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
			return repo.description?.trim() || null;
		}
	}
	return null;
}

/* ---------------------------------------------------------------- website */

/**
 * Descriptions for the website's project list, keyed by project key. Only
 * GitHub projects are looked up; anything else maps to null. Best effort — a
 * failure for one repo never fails the rest.
 */
export const describe = action({
	args: { keys: v.array(v.string()) },
	handler: async (ctx, args): Promise<Record<string, string | null>> => {
		const userId = await requireUser(ctx);

		let token: string | null = null;
		try {
			token = await githubToken(ctx, userId);
		} catch {
			// signed in some other way, or the app was never installed
		}

		const entries = await Promise.all(
			args.keys.map(async (key): Promise<[string, string | null]> => {
				const path = key.startsWith('github.com/') ? key.slice('github.com/'.length) : null;
				return [key, path ? await describeRepo(token, path) : null];
			})
		);

		return Object.fromEntries(entries);
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
