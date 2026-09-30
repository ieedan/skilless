import { v } from 'convex/values';
import { convexError, createConvexError } from './errors';
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
 * Binds or unbinds a skill by project key, for a repo the website lists from
 * GitHub before it is a project. Binding creates the project.
 */
export const setBindingByKey = mutation({
	args: { key: v.string(), skillId: v.id('skills'), bound: v.boolean() },
	handler: async (ctx, args) => {
		const userId = await requireUser(ctx);

		const skill = await ctx.db.get(args.skillId);
		if (!skill || skill.userId !== userId || skill.deletedAt !== undefined) return;

		const project = args.bound
			? await model.ensureProject(ctx, userId, args.key)
			: await model.findProject(ctx, userId, args.key);
		if (!project) return;

		const binding = await ctx.db
			.query('bindings')
			.withIndex('by_project_and_skill', (q) =>
				q.eq('projectId', project._id).eq('skillId', args.skillId)
			)
			.first();

		if (args.bound && !binding) {
			await ctx.db.insert('bindings', { projectId: project._id, skillId: args.skillId });
		} else if (!args.bound && binding) {
			await ctx.db.delete(binding._id);
		}
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

/**
 * Forgets a project: every binding goes, the skills themselves stay. A later
 * `skilless add` in the repo brings the project back.
 */
export const remove = mutation({
	args: { projectId: v.id('projects') },
	handler: async (ctx, args) => {
		const userId = await requireUser(ctx);

		const project = await ctx.db.get(args.projectId);
		if (!project || project.userId !== userId) return;

		const bindings = await ctx.db
			.query('bindings')
			.withIndex('by_project', (q) => q.eq('projectId', args.projectId))
			.collect();

		for (const binding of bindings) await ctx.db.delete(binding._id);
		await ctx.db.delete(args.projectId);
	}
});

/* -------------------------------------------------------------------- api */

/** Every project, with the names of the skills explicitly bound to it. Globals are not listed. */
export const listFor = secretQuery({
	args: { userId: v.string() },
	handler: async (ctx, args) => {
		const projects = await ctx.db
			.query('projects')
			.withIndex('by_user', (q) => q.eq('userId', args.userId))
			.collect();

		const withSkills = await Promise.all(
			projects.map(async (project) => {
				const bindings = await ctx.db
					.query('bindings')
					.withIndex('by_project', (q) => q.eq('projectId', project._id))
					.collect();

				const skills: string[] = [];
				for (const binding of bindings) {
					const skill = await ctx.db.get(binding.skillId);
					if (skill && skill.deletedAt === undefined) skills.push(skill.name);
				}

				return {
					key: project.key,
					description: project.repo?.description ?? null,
					skills: skills.sort()
				};
			})
		);

		return withSkills.sort((a, b) => a.key.localeCompare(b.key));
	}
});

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

/** Binds or unbinds one skill by name. Binding creates the project, the way `skilless add` would. */
export const setBindingFor = secretMutation({
	args: { userId: v.string(), key: v.string(), name: v.string(), bound: v.boolean() },
	handler: async (ctx, args) => {
		const skill = await model.findSkill(ctx, args.userId, args.name);
		if (!skill) throw createConvexError(convexError.SkillNotFound());

		const project = args.bound
			? await model.ensureProject(ctx, args.userId, args.key)
			: await model.findProject(ctx, args.userId, args.key);
		if (!project) return;

		const binding = await ctx.db
			.query('bindings')
			.withIndex('by_project_and_skill', (q) =>
				q.eq('projectId', project._id).eq('skillId', skill._id)
			)
			.first();

		if (args.bound && !binding) {
			await ctx.db.insert('bindings', { projectId: project._id, skillId: skill._id });
		} else if (!args.bound && binding) {
			await ctx.db.delete(binding._id);
		}
	}
});
