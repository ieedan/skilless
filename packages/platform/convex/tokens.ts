import { v } from 'convex/values';
import { convexError, createConvexError } from './errors';
import { mutation, query, requireUser, secretMutation } from './utils';

/** How stale `lastUsedAt` may get before a verify writes a fresh one. */
const TOUCH_INTERVAL_MS = 60 * 60 * 1000;

/* ---------------------------------------------------------------- website */

export const list = query({
	args: {},
	handler: async (ctx) => {
		const user = await ctx.auth.getUserIdentity();
		if (!user) return [];

		const rows = await ctx.db
			.query('cliTokens')
			.withIndex('by_user', (q) => q.eq('userId', user.subject))
			.collect();

		// never expose the hash
		return rows.map(({ hash: _hash, ...rest }) => rest).sort((a, b) => b.createdAt - a.createdAt);
	}
});

/**
 * Stores the hash of a token minted by the SvelteKit server. The plaintext is
 * generated with node crypto, shown to the user once, and never reaches Convex.
 */
export const store = mutation({
	args: { hash: v.string(), name: v.string() },
	handler: async (ctx, args) => {
		const userId = await requireUser(ctx);

		return await ctx.db.insert('cliTokens', {
			userId,
			hash: args.hash,
			name: args.name,
			createdAt: Date.now()
		});
	}
});

export const revoke = mutation({
	args: { tokenId: v.id('cliTokens') },
	handler: async (ctx, args) => {
		const userId = await requireUser(ctx);

		const token = await ctx.db.get(args.tokenId);
		if (!token || token.userId !== userId) return;

		await ctx.db.delete(token._id);
	}
});

/* -------------------------------------------------------------------- api */

export const verify = secretMutation({
	args: { hash: v.string() },
	handler: async (ctx, args) => {
		const token = await ctx.db
			.query('cliTokens')
			.withIndex('by_hash', (q) => q.eq('hash', args.hash))
			.first();

		if (!token) throw createConvexError(convexError.InvalidToken());

		const now = Date.now();
		if (!token.lastUsedAt || now - token.lastUsedAt > TOUCH_INTERVAL_MS) {
			await ctx.db.patch(token._id, { lastUsedAt: now });
		}

		return { userId: token.userId };
	}
});
