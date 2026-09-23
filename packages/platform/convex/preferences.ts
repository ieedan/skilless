import { v } from 'convex/values';
import { mutation, query, requireUser } from './utils';

export type Preferences = { hideEmail: boolean };

/** The signed-in user's preferences, with defaults filled in. */
export const get = query({
	args: {},
	handler: async (ctx): Promise<Preferences> => {
		const user = await ctx.auth.getUserIdentity();
		const row = user
			? await ctx.db
					.query('preferences')
					.withIndex('by_user', (q) => q.eq('userId', user.subject))
					.unique()
			: null;

		return { hideEmail: row?.hideEmail ?? false };
	}
});

export const setHideEmail = mutation({
	args: { hideEmail: v.boolean() },
	handler: async (ctx, args) => {
		const userId = await requireUser(ctx);
		const row = await ctx.db
			.query('preferences')
			.withIndex('by_user', (q) => q.eq('userId', userId))
			.unique();

		if (row) await ctx.db.patch(row._id, { hideEmail: args.hideEmail });
		else await ctx.db.insert('preferences', { userId, hideEmail: args.hideEmail });
	}
});
