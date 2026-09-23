import { v } from 'convex/values';
import { internalMutation, internalQuery } from './_generated/server';
import * as model from './model';
import { r2 } from './r2';
import { mutation, query, requireUser, secretMutation, secretQuery } from './utils';

/*
 * Writes that carry file contents are actions in `files.ts`, since contents go
 * to R2 first. What is left here only touches rows.
 */

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

		const rows = await model.fileRows(ctx, skill._id);

		return {
			...skill,
			/** Paths only. Contents come from `links:read`. */
			files: rows.map((row) => ({ path: row.path })),
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

export const setGlobalFor = secretMutation({
	args: { userId: v.string(), name: v.string(), global: v.boolean() },
	handler: async (ctx, args) => {
		await model.setGlobal(ctx, args.userId, args.name, args.global);
	}
});

export const setSourceFor = secretMutation({
	args: {
		userId: v.string(),
		name: v.string(),
		source: v.union(
			v.object({
				url: v.string(),
				ref: v.optional(v.string()),
				path: v.string(),
				hash: v.string()
			}),
			v.null()
		)
	},
	handler: async (ctx, args) => {
		await model.setSource(ctx, args.userId, args.name, args.source);
	}
});

export const removeFor = secretMutation({
	args: { userId: v.string(), name: v.string() },
	handler: async (ctx, args) => {
		await model.softDeleteSkill(ctx, args.userId, args.name);
	}
});

/* --------------------------------------------------------------- internal */

const storedFileValidator = v.object({
	path: v.string(),
	key: v.string(),
	sha256: v.string(),
	size: v.number()
});

/** What a write action starts from: the live skill's hash and file rows, or null. */
export const snapshot = internalQuery({
	args: { userId: v.string(), name: v.string() },
	handler: async (ctx, args) => {
		const skill = await model.findSkill(ctx, args.userId, args.name);
		if (!skill) return null;

		return { skill, files: await model.fileRows(ctx, skill._id) };
	}
});

/** Every live skill with its SKILL.md row, for the frontmatter backfill. */
export const allLive = internalQuery({
	args: {},
	handler: async (ctx) => {
		const skills = await ctx.db.query('skills').collect();
		const live = skills.filter((skill) => skill.deletedAt === undefined);

		return await Promise.all(
			live.map(async (skill) => ({
				skill,
				main: (await model.fileRows(ctx, skill._id)).find((row) => row.path === 'SKILL.md') ?? null
			}))
		);
	}
});

export const setFrontmatter = internalMutation({
	args: {
		skillId: v.id('skills'),
		title: v.optional(v.string()),
		description: v.optional(v.string()),
		metadata: v.optional(v.record(v.string(), v.any()))
	},
	handler: async (ctx, { skillId, ...frontmatter }) => {
		await ctx.db.patch(skillId, frontmatter);
	}
});

export const commit = internalMutation({
	args: {
		userId: v.string(),
		name: v.string(),
		create: v.boolean(),
		basedOn: v.union(v.string(), v.null()),
		files: v.array(storedFileValidator),
		uploaded: v.array(v.string()),
		contentHash: v.string(),
		title: v.optional(v.string()),
		description: v.optional(v.string()),
		metadata: v.optional(v.record(v.string(), v.any())),
		soleFile: v.optional(v.string()),
		editedAt: v.number()
	},
	handler: async (ctx, args) => {
		return await model.commitSkill(ctx, args);
	}
});

/** Drops objects a failed write uploaded but never committed. */
export const discard = internalMutation({
	args: { keys: v.array(v.string()) },
	handler: async (ctx, args) => {
		for (const key of args.keys) await r2.deleteObject(ctx, key);
	}
});
