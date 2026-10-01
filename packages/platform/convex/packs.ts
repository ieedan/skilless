import { v } from 'convex/values';
import type { MutationCtx } from './_generated/server';
import { convexError, createConvexError } from './errors';
import * as model from './model';
import { internalMutation } from './_generated/server';
import { mutation, query, requireUser, secretMutation, secretQuery } from './utils';

/*
 * Packs: a named list of skill sources, served as JSON at `skilless.dev/packs/<uuid>`
 * for `skilless add` to read. Entries are strings exactly as a hand-written pack
 * file holds them, so what the website builds and what someone writes are one format.
 */

const MAX_ENTRIES = 200;
const MAX_ENTRY = 500;
const MAX_NAME = 100;
const MAX_DESCRIPTION = 500;

function invalid(reason: string): never {
	throw createConvexError(convexError.InvalidPack({ reason }));
}

function cleanName(name: string): string {
	const trimmed = name.trim();
	if (!trimmed) invalid('a pack needs a name');
	if (trimmed.length > MAX_NAME) invalid(`names are limited to ${MAX_NAME} characters`);
	return trimmed;
}

function cleanDescription(description: string): string | undefined {
	const trimmed = description.trim();
	if (trimmed.length > MAX_DESCRIPTION) {
		invalid(`descriptions are limited to ${MAX_DESCRIPTION} characters`);
	}
	return trimmed || undefined;
}

/** Trimmed, blank lines and repeats dropped, in the order given. */
function cleanEntries(entries: string[]): string[] {
	const cleaned = [...new Set(entries.map((entry) => entry.trim()).filter(Boolean))];
	if (cleaned.length > MAX_ENTRIES) invalid(`packs are limited to ${MAX_ENTRIES} skills`);
	if (cleaned.some((entry) => entry.length > MAX_ENTRY)) invalid('that address is too long');
	if (cleaned.some((entry) => /\s/.test(entry))) invalid('addresses cannot contain spaces');
	return cleaned;
}

type Change = Partial<{
	name: string;
	description: string | undefined;
	skills: string[];
	public: boolean;
}>;

/** Changes one of the user's packs, counting its skills again when its entries change. */
async function patchFor(
	ctx: MutationCtx,
	userId: string,
	uuid: string,
	change: (pack: Awaited<ReturnType<typeof model.ownPack>>) => Change
) {
	const pack = await model.ownPack(ctx, userId, uuid);
	const changed = change(pack);

	// only what is new can make a loop; what was there already passed this check
	if (changed.skills) {
		await model.assertNoLoop(
			ctx,
			pack,
			changed.skills.filter((entry) => !pack.skills.includes(entry))
		);
	}

	await ctx.db.patch(pack._id, { ...changed, updatedAt: Date.now() });
	const updated = (await ctx.db.get(pack._id))!;

	if (changed.skills) {
		await model.linkPacks(ctx, updated);
		await model.snapshotCount(ctx, updated);
	}
	// who can see it decides whether other people's packs can count its skills
	if (changed.public !== undefined) await model.recountIncluding(ctx, pack.uuid);
}

/**
 * Deletes one of the user's packs. Packs that included it keep the entry, as a
 * dead link, and count it as such.
 */
async function deleteFor(ctx: MutationCtx, userId: string, uuid: string) {
	const pack = await model.ownPack(ctx, userId, uuid);

	const links = await ctx.db
		.query('packLinks')
		.withIndex('by_from', (q) => q.eq('from', pack._id))
		.collect();
	for (const link of links) await ctx.db.delete(link._id);

	await ctx.db.delete(pack._id);
	await model.recountIncluding(ctx, pack.uuid);
}

/** As `patchFor`, as the signed in user. */
async function patch(
	ctx: MutationCtx,
	uuid: string,
	change: (pack: Awaited<ReturnType<typeof model.ownPack>>) => Partial<{
		name: string;
		description: string | undefined;
		skills: string[];
		public: boolean;
	}>
) {
	await patchFor(ctx, await requireUser(ctx), uuid, change);
}

async function createFor(
	ctx: MutationCtx,
	userId: string,
	args: { name: string; description: string; skills?: string[]; public?: boolean }
): Promise<string> {
	const uuid = crypto.randomUUID();

	const id = await ctx.db.insert('packs', {
		userId,
		uuid,
		name: cleanName(args.name),
		description: cleanDescription(args.description),
		skills: cleanEntries(args.skills ?? []),
		...(args.public ? { public: true } : {}),
		skillCount: 0,
		updatedAt: Date.now()
	});
	const pack = (await ctx.db.get(id))!;
	await model.linkPacks(ctx, pack);
	await model.snapshotCount(ctx, pack);

	return uuid;
}

/* ---------------------------------------------------------------- website */

export const list = query({
	args: {},
	handler: async (ctx) => {
		const user = await ctx.auth.getUserIdentity();
		if (!user) return [];
		return await model.listPacks(ctx, user.subject);
	}
});

/** A pack at its address. Public, or the signed in viewer's own. */
export const view = query({
	args: { uuid: v.string() },
	handler: async (ctx, args) => {
		if (!model.isUuid(args.uuid)) return null;
		const user = await ctx.auth.getUserIdentity();
		return await model.viewPack(ctx, args.uuid, user?.subject ?? null);
	}
});

/**
 * A pack and every skill it brings, each with the entry that would bring it
 * alone, for picking some of a pack's skills. Public, or the viewer's own.
 */
export const skillsOf = query({
	args: { uuid: v.string() },
	handler: async (ctx, args) => {
		if (!model.isUuid(args.uuid)) return null;
		const user = await ctx.auth.getUserIdentity();
		const viewerId = user?.subject ?? null;

		const view = await model.viewPack(ctx, args.uuid, viewerId);
		if (!view) return null;

		return {
			pack: {
				uuid: view.pack.uuid,
				name: view.pack.name,
				...(view.pack.description ? { description: view.pack.description } : {}),
				public: view.pack.public === true,
				skillCount: view.pack.skillCount ?? view.pack.skills.length,
				countPartial: view.pack.skillCount === undefined || view.pack.countPartial === true,
				skills: view.pack.skills,
				owner: view.owner,
				mine: view.mine
			},
			skills: await model.packSkills(ctx, view.pack, viewerId)
		};
	}
});

export const create = mutation({
	args: { name: v.string(), description: v.string() },
	handler: async (ctx, args): Promise<string> => {
		return await createFor(ctx, await requireUser(ctx), args);
	}
});

export const rename = mutation({
	args: { uuid: v.string(), name: v.string(), description: v.string() },
	handler: async (ctx, args) => {
		await patch(ctx, args.uuid, () => ({
			name: cleanName(args.name),
			description: cleanDescription(args.description)
		}));
	}
});

export const setPublic = mutation({
	args: { uuid: v.string(), public: v.boolean() },
	handler: async (ctx, args) => {
		await patch(ctx, args.uuid, () => ({ public: args.public }));
	}
});

/** Adds entries to the end, skipping any it already has. */
export const addEntries = mutation({
	args: { uuid: v.string(), entries: v.array(v.string()) },
	handler: async (ctx, args) => {
		await patch(ctx, args.uuid, (pack) => ({
			skills: cleanEntries([...pack.skills, ...args.entries])
		}));
	}
});

export const removeEntry = mutation({
	args: { uuid: v.string(), entry: v.string() },
	handler: async (ctx, args) => {
		await patch(ctx, args.uuid, (pack) => ({
			skills: pack.skills.filter((entry) => entry !== args.entry)
		}));
	}
});

/** Packs are small, so they go for good. */
export const remove = mutation({
	args: { uuid: v.string() },
	handler: async (ctx, args) => {
		await deleteFor(ctx, await requireUser(ctx), args.uuid);
	}
});

/* -------------------------------------------------------------------- api */

/** A pack at its address, for its JSON. `viewerId` is whoever the bearer token belongs to, if anyone. */
export const viewFor = secretQuery({
	args: { uuid: v.string(), viewerId: v.union(v.string(), v.null()) },
	handler: async (ctx, args) => {
		if (!model.isUuid(args.uuid)) return null;
		return await model.viewPack(ctx, args.uuid, args.viewerId);
	}
});

/** The user's packs, for the CLI and MCP. */
export const listFor = secretQuery({
	args: { userId: v.string() },
	handler: async (ctx, args) => {
		return await model.listPacks(ctx, args.userId);
	}
});

/** One of the user's packs with what its entries resolve to, or null when there is none. */
export const getFor = secretQuery({
	args: { userId: v.string(), uuid: v.string() },
	handler: async (ctx, args) => {
		if (!model.isUuid(args.uuid)) return null;
		const view = await model.viewPack(ctx, args.uuid, args.userId);
		return view?.mine ? view : null;
	}
});

export const createPackFor = secretMutation({
	args: {
		userId: v.string(),
		name: v.string(),
		description: v.string(),
		skills: v.optional(v.array(v.string())),
		public: v.optional(v.boolean())
	},
	handler: async (ctx, { userId, ...args }): Promise<string> => {
		return await createFor(ctx, userId, args);
	}
});

export const addEntriesFor = secretMutation({
	args: { userId: v.string(), uuid: v.string(), entries: v.array(v.string()) },
	handler: async (ctx, args) => {
		await patchFor(ctx, args.userId, args.uuid, (pack) => ({
			skills: cleanEntries([...pack.skills, ...args.entries])
		}));
	}
});

export const removeEntriesFor = secretMutation({
	args: { userId: v.string(), uuid: v.string(), entries: v.array(v.string()) },
	handler: async (ctx, args) => {
		await patchFor(ctx, args.userId, args.uuid, (pack) => ({
			skills: pack.skills.filter((entry) => !args.entries.includes(entry))
		}));
	}
});

export const setPublicFor = secretMutation({
	args: { userId: v.string(), uuid: v.string(), public: v.boolean() },
	handler: async (ctx, args) => {
		await patchFor(ctx, args.userId, args.uuid, () => ({ public: args.public }));
	}
});

export const removeFor = secretMutation({
	args: { userId: v.string(), uuid: v.string() },
	handler: async (ctx, args) => {
		await deleteFor(ctx, args.userId, args.uuid);
	}
});

/** Counts every pack's skills, for packs from before counts. Safe to run again: `npx convex run packs:backfillCounts`. */
export const backfillCounts = internalMutation({
	args: {},
	handler: async (ctx): Promise<{ updated: number }> => {
		const packs = await ctx.db.query('packs').collect();
		for (const pack of packs) {
			await model.linkPacks(ctx, pack);
			await model.snapshotCount(ctx, pack);
		}
		return { updated: packs.length };
	}
});
