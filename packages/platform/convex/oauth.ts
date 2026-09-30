import { v } from 'convex/values';
import { mutation, requireUser, secretMutation } from './utils';

/*
 * The authorization server half of OAuth for MCP clients. The SvelteKit app
 * owns the protocol — metadata, client ids, PKCE, the consent page — and this
 * only keeps the one piece of state it needs: codes waiting to be exchanged.
 *
 * What a code exchanges for is an ordinary token in `cliTokens`, so the MCP
 * server and REST API accept it as they would any other, and the user revokes
 * it from the same list in settings.
 */

/** How long an approved code waits to be exchanged. Clients do it immediately. */
const CODE_TTL_MS = 5 * 60 * 1000;

/* ---------------------------------------------------------------- website */

/** Records a code for the signed in user, who has just approved `clientName`. */
export const createCode = mutation({
	args: {
		hash: v.string(),
		clientId: v.string(),
		clientName: v.string(),
		redirectUri: v.string(),
		codeChallenge: v.string()
	},
	handler: async (ctx, args) => {
		const userId = await requireUser(ctx);
		const now = Date.now();

		// codes that were never exchanged are only ever cleaned up here
		const stale = await ctx.db
			.query('oauthCodes')
			.withIndex('by_user', (q) => q.eq('userId', userId))
			.collect();

		for (const code of stale) {
			if (code.expiresAt < now) await ctx.db.delete(code._id);
		}

		await ctx.db.insert('oauthCodes', { ...args, userId, expiresAt: now + CODE_TTL_MS });
	}
});

/* -------------------------------------------------------------------- api */

/**
 * Trades a code for a token. The code is spent whether or not the rest checks
 * out, so a code that leaks can be tried at most once.
 */
export const exchange = secretMutation({
	args: {
		hash: v.string(),
		clientId: v.string(),
		redirectUri: v.string(),
		/** S256 of the verifier the client sent, computed by the caller. */
		codeChallenge: v.string(),
		tokenHash: v.string()
	},
	handler: async (ctx, args): Promise<{ ok: boolean }> => {
		const code = await ctx.db
			.query('oauthCodes')
			.withIndex('by_hash', (q) => q.eq('hash', args.hash))
			.first();

		if (!code) return { ok: false };
		await ctx.db.delete(code._id);

		if (
			code.expiresAt < Date.now() ||
			code.clientId !== args.clientId ||
			code.redirectUri !== args.redirectUri ||
			code.codeChallenge !== args.codeChallenge
		) {
			return { ok: false };
		}

		await ctx.db.insert('cliTokens', {
			userId: code.userId,
			hash: args.tokenHash,
			name: code.clientName,
			kind: 'mcp',
			createdAt: Date.now()
		});

		return { ok: true };
	}
});
