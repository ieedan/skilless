import { v } from 'convex/values';
import * as model from './model';
import { mutation, query, requireUser, secretMutation, secretQuery } from './utils';

/* ---------------------------------------------------------------- website */

export const list = query({
	args: {},
	handler: async (ctx) => {
		const user = await ctx.auth.getUserIdentity();
		if (!user) return [];

		const projects = await ctx.db
			.query('projects')
			.withIndex('by_user', (q) => q.eq('userId', user.subject))
			.collect();

		return projects.sort((a, b) => a.key.localeCompare(b.key));
	}
});

/** Binds one skill to one project. A no-op when it is already bound. */
export const bind = mutation({
	args: { projectId: v.id('projects'), skillId: v.id('skills') },
	handler: async (ctx, args) => {
		const userId = await requireUser(ctx);

		const project = await ctx.db.get(args.projectId);
		if (!project || project.userId !== userId) return;

		const skill = await ctx.db.get(args.skillId);
		if (!skill || skill.userId !== userId || skill.deletedAt !== undefined) return;

		const binding = await ctx.db
			.query('bindings')
			.withIndex('by_project_and_skill', (q) =>
				q.eq('projectId', args.projectId).eq('skillId', args.skillId)
			)
			.first();

		if (!binding) await ctx.db.insert('bindings', args);
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

/**
 * Resolves a project's bindings to skills, for `skilless install`. Rows only —
 * their files come from `links:readFor`.
 */
export const boundFor = secretQuery({
	args: { userId: v.string(), key: v.string() },
	handler: async (ctx, args) => {
		return await model.boundSkills(ctx, args.userId, args.key);
	}
});

export const setBindingsFor = secretMutation({
	args: { userId: v.string(), key: v.string(), names: v.array(v.string()) },
	handler: async (ctx, args) => {
		return await model.setBindings(ctx, args.userId, args.key, args.names);
	}
});
