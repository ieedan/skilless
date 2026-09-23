import { customAction, customMutation, customQuery } from 'convex-helpers/server/customFunctions';
import type { Auth, GenericActionCtx, GenericQueryCtx } from 'convex/server';
import { v } from 'convex/values';
import { env } from '../env.convex';
import type { DataModel } from './_generated/dataModel';
import { action, mutation, query } from './_generated/server';
import { convexError, createConvexError } from './errors';

/**
 * Queries and mutations callable server to server by the Hono API, which
 * authenticates CLI users itself and so has no Convex session to present.
 */
export const secretQuery = customQuery(query, {
	args: { secret: v.string() },
	input: verifySecret
});

export const secretMutation = customMutation(mutation, {
	args: { secret: v.string() },
	input: verifySecret
});

export const secretAction = customAction(action, {
	args: { secret: v.string() },
	input: verifySecret
});

function verifySecret<
	QueryContext extends GenericQueryCtx<DataModel> | GenericActionCtx<DataModel>
>(ctx: QueryContext, args: { secret: string }) {
	if (args.secret !== env.FUNCTION_SECRET) {
		throw createConvexError(convexError.InvalidSecretError());
	}
	return { ctx, args: {} };
}

/** Resolves the signed in user, throwing if there isn't one. */
export async function requireUser(ctx: { auth: Auth }): Promise<string> {
	const user = await ctx.auth.getUserIdentity();
	if (!user) throw createConvexError(convexError.Unauthorized());
	return user.subject;
}

export { action, mutation, query };
