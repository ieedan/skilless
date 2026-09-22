import { v } from 'convex/values';
import { convexError, createConvexError } from './errors';
import * as model from './model';
import { mutation, query, requireUser, secretMutation, secretQuery } from './utils';

const fileValidator = v.object({ path: v.string(), contents: v.string() });

/* ---------------------------------------------------------------- website */

export const list = query({
	args: {},
	handler: async (ctx) => {
		const user = await ctx.auth.getUserIdentity();
		if (!user) return [];
		return await model.listSkillsForDisplay(ctx, user.subject);
	}
});

export const get = query({
	args: { name: v.string() },
	handler: async (ctx, args) => {
		const user = await ctx.auth.getUserIdentity();
		if (!user) return null;

		const skill = await model.findSkill(ctx, user.subject, args.name);
		if (!skill) return null;

		return {
			...skill,
			files: await model.readFiles(ctx, skill._id),
			projects: await model.projectsForSkill(ctx, skill._id)
		};
	}
});

export const trash = query({
	args: {},
	handler: async (ctx) => {
		const user = await ctx.auth.getUserIdentity();
		if (!user) return [];
		return await model.listTrash(ctx, user.subject);
	}
});

export const restore = mutation({
	args: { skillId: v.id('skills') },
	handler: async (ctx, args) => {
		const userId = await requireUser(ctx);
		await model.restoreSkill(ctx, userId, args.skillId);
	}
});

/**
 * Writes one file back from the website.
 *
 * `contentHash` is computed by our own SvelteKit server over the whole file set
 * (see `$lib/server/hash`), exactly as the CLI does before calling the API —
 * the browser never supplies it.
 */
export const writeFile = mutation({
	args: {
		name: v.string(),
		path: v.string(),
		contents: v.string(),
		contentHash: v.string(),
		editedAt: v.number()
	},
	handler: async (ctx, args) => {
		const userId = await requireUser(ctx);
		await model.writeSkillFile(ctx, { userId, ...args });
	}
});

/** Deletes a file, or a whole directory, from a skill. */
export const deletePath = mutation({
	args: {
		name: v.string(),
		path: v.string(),
		contentHash: v.string(),
		editedAt: v.number()
	},
	handler: async (ctx, args) => {
		const userId = await requireUser(ctx);
		return await model.deleteSkillPath(ctx, { userId, ...args });
	}
});

/** Creates a skill from the website. Fails if the name is taken. */
export const create = mutation({
	args: {
		name: v.string(),
		files: v.array(fileValidator),
		contentHash: v.string(),
		editedAt: v.number()
	},
	handler: async (ctx, args) => {
		const userId = await requireUser(ctx);
		await model.createSkill(ctx, { userId, ...args });
	}
});

export const setGlobal = mutation({
	args: { name: v.string(), global: v.boolean() },
	handler: async (ctx, args) => {
		const userId = await requireUser(ctx);
		await model.setGlobal(ctx, userId, args.name, args.global);
	}
});

export const remove = mutation({
	args: { name: v.string() },
	handler: async (ctx, args) => {
		const userId = await requireUser(ctx);
		await model.softDeleteSkill(ctx, userId, args.name);
	}
});

/* -------------------------------------------------------------------- api */

export const listFor = secretQuery({
	args: { userId: v.string() },
	handler: async (ctx, args) => {
		return await model.listSkills(ctx, args.userId);
	}
});

export const getFor = secretQuery({
	args: { userId: v.string(), name: v.string() },
	handler: async (ctx, args) => {
		const skill = await model.findSkill(ctx, args.userId, args.name);
		if (!skill) return null;
		return { ...skill, files: await model.readFiles(ctx, skill._id) };
	}
});

export const upsertFor = secretMutation({
	args: {
		userId: v.string(),
		name: v.string(),
		files: v.array(fileValidator),
		contentHash: v.string(),
		editedAt: v.number()
	},
	handler: async (ctx, args) => {
		const skillId = await model.upsertSkill(ctx, args);
		const skill = await ctx.db.get(skillId);
		if (!skill) throw createConvexError(convexError.SkillNotFound());
		return skill;
	}
});

export const setGlobalFor = secretMutation({
	args: { userId: v.string(), name: v.string(), global: v.boolean() },
	handler: async (ctx, args) => {
		await model.setGlobal(ctx, args.userId, args.name, args.global);
	}
});

export const removeFor = secretMutation({
	args: { userId: v.string(), name: v.string() },
	handler: async (ctx, args) => {
		await model.softDeleteSkill(ctx, args.userId, args.name);
	}
});
