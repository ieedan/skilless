import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';
import * as model from './model';
import { type FileLink, toLinks } from './r2';
import { query, requireUser, secretQuery } from './utils';

/*
 * Where to fetch a skill's file contents from. The URLs are public and stable
 * rather than signed, so these are plain queries and every layer can cache.
 */

async function readSkill(
	ctx: QueryCtx,
	userId: string,
	name: string
): Promise<{ skill: Doc<'skills'>; files: FileLink[] } | null> {
	const skill = await model.findSkill(ctx, userId, name);
	if (!skill) return null;

	return { skill, files: toLinks(await model.fileRows(ctx, skill._id)) };
}

/* ---------------------------------------------------------------- website */

/** Links to every file of a skill, or null when there is no such skill. */
export const read = query({
	args: { name: v.string() },
	handler: async (ctx, args): Promise<FileLink[] | null> => {
		const userId = await requireUser(ctx);
		return (await readSkill(ctx, userId, args.name))?.files ?? null;
	}
});

/** Links to every file of every skill the user has, for a backup. */
export const readAll = query({
	args: {},
	handler: async (ctx): Promise<{ name: string; files: FileLink[] }[]> => {
		const userId = await requireUser(ctx);
		const skills = await model.listSkills(ctx, userId);

		return await Promise.all(
			skills.map(async (skill) => ({
				name: skill.name,
				files: toLinks(await model.fileRows(ctx, skill._id))
			}))
		);
	}
});

/* -------------------------------------------------------------------- api */

/** Skills by name, each with links to its files, or null where there is none. */
export const readFor = secretQuery({
	args: { userId: v.string(), names: v.array(v.string()) },
	handler: async (ctx, args): Promise<({ skill: Doc<'skills'>; files: FileLink[] } | null)[]> => {
		return await Promise.all(args.names.map((name) => readSkill(ctx, args.userId, name)));
	}
});
