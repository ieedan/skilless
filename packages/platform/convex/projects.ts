import { v } from 'convex/values';
import * as model from './model';
import { mutation, query, requireUser, secretMutation, secretQuery } from './utils';

/* ---------------------------------------------------------------- website */

export const list = query({
	args: {},
	handler: async (ctx) => {
		const user = await ctx.auth.getUserIdentity();
		if (!user) return [];

		return await ctx.db
			.query('projects')
			.withIndex('by_user', (q) => q.eq('userId', user.subject))
			.collect();
	}
});

/**
 * Unbinds one skill from one project without deleting it. The CLI has no verb for
 * this — `skilless remove` deletes outright — so the website is where you undo a
 * mistaken `skilless add`.
 */
export const unbind = mutation({
	args: { projectId: v.id('projects'), skillId: v.id('skills') },
	handler: async (ctx, args) => {
		const userId = await requireUser(ctx);

		const project = await ctx.db.get(args.projectId);
		if (!project || project.userId !== userId) return;

		const binding = await ctx.db
			.query('bindings')
			.withIndex('by_project_and_skill', (q) =>
				q.eq('projectId', args.projectId).eq('skillId', args.skillId)
			)
			.first();

		if (binding) await ctx.db.delete(binding._id);
	}
});

/* -------------------------------------------------------------------- api */

/** Resolves a project's bindings to full skills, including file contents, for `skilless install`. */
export const boundFor = secretQuery({
	args: { userId: v.string(), key: v.string() },
	handler: async (ctx, args) => {
		const skills = await model.boundSkills(ctx, args.userId, args.key);

		return await Promise.all(
			skills.map(async (skill) => ({
				...skill,
				files: await model.readFiles(ctx, skill._id)
			}))
		);
	}
});

export const setBindingsFor = secretMutation({
	args: { userId: v.string(), key: v.string(), names: v.array(v.string()) },
	handler: async (ctx, args) => {
		return await model.setBindings(ctx, args.userId, args.key, args.names);
	}
});
