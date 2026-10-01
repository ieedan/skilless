import { v } from 'convex/values';
import { components, internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import {
	type ActionCtx,
	internalAction,
	internalMutation,
	internalQuery,
	type QueryCtx
} from './_generated/server';
import { githubToken } from './github';
import { action, query, requireUser, secretQuery } from './utils';

/*
 * Usernames: a user's GitHub login, so a public address reads as
 * `skilless.dev/skills/<username>/<skill>`. GitHub logins can be renamed and
 * then taken by someone else, so the login is always looked up again by the
 * account's numeric id, which never changes, and a name already held is
 * checked with GitHub before it is handed over.
 */

/** How many users one backfill call works through before handing on. */
const BACKFILL_BATCH = 50;

/* ---------------------------------------------------------------- helpers */

/** A user's profile, by their skilless id. */
export async function profileOf(ctx: QueryCtx, userId: string): Promise<Doc<'profiles'> | null> {
	return await ctx.db
		.query('profiles')
		.withIndex('by_user', (q) => q.eq('userId', userId))
		.unique();
}

/** Whose username this is. Case does not matter: usernames are stored lowercased. */
export async function profileByUsername(
	ctx: QueryCtx,
	username: string
): Promise<Doc<'profiles'> | null> {
	return await ctx.db
		.query('profiles')
		.withIndex('by_username', (q) => q.eq('username', username.toLowerCase()))
		.unique();
}

/** The current login of a GitHub account, by its numeric id. Null if GitHub cannot say. */
async function loginOf(token: string | null, githubId: string): Promise<string | null> {
	for (const auth of token ? [token, null] : [null]) {
		const response = await fetch(`https://api.github.com/user/${encodeURIComponent(githubId)}`, {
			headers: {
				...(auth ? { Authorization: `Bearer ${auth}` } : {}),
				Accept: 'application/vnd.github+json',
				'User-Agent': 'skilless',
				'X-GitHub-Api-Version': '2022-11-28'
			}
		}).catch(() => null);
		if (response?.ok) return ((await response.json()) as { login: string }).login;
		if (response?.status === 404) return null;
	}
	return null;
}

/**
 * Looks the user's login up on GitHub and claims it. When someone else holds
 * that name, their record is stale (GitHub logins are unique), so theirs is
 * looked up again first and the name then moves. Returns the username, or
 * null if GitHub could not be asked.
 */
async function refreshUser(ctx: ActionCtx, userId: string, depth = 0): Promise<string | null> {
	const githubId = await ctx.runQuery(internal.profiles.githubIdOf, { userId });
	if (!githubId) return null;

	let token: string | null = null;
	try {
		token = await githubToken(ctx, userId);
	} catch {
		// anonymous lookups still work, at a lower rate limit
	}

	const login = await loginOf(token, githubId);
	if (!login) return null;

	const result = await ctx.runMutation(internal.profiles.claim, { userId, githubId, login });
	if (result.ok) return result.username;

	// held by someone whose login has since changed: theirs first, then ours again
	if (depth === 0) {
		await refreshUser(ctx, result.heldBy, depth + 1);
		const retry = await ctx.runMutation(internal.profiles.claim, { userId, githubId, login });
		if (retry.ok) return retry.username;
	}
	return null;
}

/* ---------------------------------------------------------------- website */

/** Your username, or null until it has been looked up. */
export const me = query({
	args: {},
	handler: async (ctx) => {
		const user = await ctx.auth.getUserIdentity();
		if (!user) return null;
		const profile = await profileOf(ctx, user.subject);
		return profile ? { username: profile.username, login: profile.login } : null;
	}
});

/** Looks your login up on GitHub now, for a profile that is missing or stale. */
export const ensure = action({
	args: {},
	handler: async (ctx): Promise<string | null> => {
		const userId = await requireUser(ctx);
		return await refreshUser(ctx, userId);
	}
});

/* -------------------------------------------------------------------- api */

/** A user's username, for addresses the API and MCP hand out. Null until it has been looked up. */
export const usernameFor = secretQuery({
	args: { userId: v.string() },
	handler: async (ctx, args): Promise<string | null> => {
		return (await profileOf(ctx, args.userId))?.username ?? null;
	}
});

/* --------------------------------------------------------------- internal */

/** The GitHub account id better-auth stored at sign-in. */
export const githubIdOf = internalQuery({
	args: { userId: v.string() },
	handler: async (ctx, args): Promise<string | null> => {
		const account = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
			model: 'account',
			where: [
				{ field: 'userId', value: args.userId },
				{ field: 'providerId', value: 'github', connector: 'AND' }
			]
		})) as { accountId: string } | null;
		return account?.accountId ?? null;
	}
});

/** Takes `login` for the user, unless someone else holds it. */
export const claim = internalMutation({
	args: { userId: v.string(), githubId: v.string(), login: v.string() },
	handler: async (
		ctx,
		args
	): Promise<{ ok: true; username: string } | { ok: false; heldBy: string }> => {
		const username = args.login.toLowerCase();
		const holder = await profileByUsername(ctx, username);
		if (holder && holder.userId !== args.userId) return { ok: false, heldBy: holder.userId };

		const fields = { githubId: args.githubId, login: args.login, username, checkedAt: Date.now() };
		const mine = await profileOf(ctx, args.userId);
		if (mine) await ctx.db.patch(mine._id, fields);
		else await ctx.db.insert('profiles', { userId: args.userId, ...fields });
		return { ok: true, username };
	}
});

/** Looks one user's login up again: on sign-in, and from the backfill. */
export const refresh = internalAction({
	args: { userId: v.string() },
	handler: async (ctx, args): Promise<string | null> => {
		return await refreshUser(ctx, args.userId);
	}
});

/**
 * Gives every user a username, a batch at a time. Safe to run again:
 * `npx convex run profiles:backfill`.
 */
export const backfill = internalAction({
	args: { cursor: v.optional(v.union(v.string(), v.null())) },
	handler: async (ctx, args): Promise<{ done: number }> => {
		const page = (await ctx.runQuery(components.betterAuth.adapter.findMany, {
			model: 'account',
			where: [{ field: 'providerId', value: 'github' }],
			paginationOpts: { cursor: args.cursor ?? null, numItems: BACKFILL_BATCH }
		})) as { page: { userId: string }[]; isDone: boolean; continueCursor: string };

		for (const account of page.page) await refreshUser(ctx, account.userId);

		if (!page.isDone) {
			await ctx.scheduler.runAfter(0, internal.profiles.backfill, { cursor: page.continueCursor });
		}
		return { done: page.page.length };
	}
});
