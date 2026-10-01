import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, type MutationCtx, type QueryCtx } from './_generated/server';
import * as model from './model';
import { profileByUsername } from './profiles';
import { query, secretMutation } from './utils';

/*
 * Installs: every time a skill or pack on skilless is added to a library, from
 * the website or the CLI, signed in or not. Kept as a running total on each
 * skill and pack (all time), and per hour (the last 24 hours), so browsing can
 * rank by either without a scheduled job.
 */

const HOUR = 60 * 60 * 1000;
/** How much of browse a page shows. */
const PAGE = 50;

type Kind = 'skill' | 'pack';

/** Counts one install of a skill or pack, now. */
export async function recordInstall(
	ctx: MutationCtx,
	kind: Kind,
	item: Doc<'skills'> | Doc<'packs'>
) {
	await ctx.db.patch(item._id, { installs: (item.installs ?? 0) + 1 });

	const hour = Math.floor(Date.now() / HOUR) * HOUR;
	const bucket = await ctx.db
		.query('installBuckets')
		.withIndex('by_item_and_hour', (q) => q.eq('itemId', item._id).eq('hour', hour))
		.unique();
	if (bucket) await ctx.db.patch(bucket._id, { count: bucket.count + 1 });
	else await ctx.db.insert('installBuckets', { kind, itemId: item._id, hour, count: 1 });
}

/**
 * Counts an install of what an address names, as the address JSON is fetched
 * by `skilless add`. Anyone's, signed in or not; gone or unknown is ignored.
 */
export const recordFor = secretMutation({
	args: {
		kind: v.union(v.literal('skill'), v.literal('pack')),
		username: v.string(),
		/** The skill's name, or the pack's slug. */
		name: v.string()
	},
	handler: async (ctx, args) => {
		const item =
			args.kind === 'skill'
				? await model.findSkillAt(ctx, args.username, args.name)
				: await model.findPackAt(ctx, args.username, args.name);
		if (item) await recordInstall(ctx, args.kind, item);
	}
});

/** For the website's own adds, by id. */
export const record = internalMutation({
	args: { kind: v.union(v.literal('skill'), v.literal('pack')), id: v.string() },
	handler: async (ctx, args) => {
		const item = await ctx.db.get(args.id as Id<'skills'> | Id<'packs'>);
		if (item) await recordInstall(ctx, args.kind, item);
	}
});

/* ----------------------------------------------------------------- browse */

/** One row of browse: enough to show it and link to it. */
export type BrowseRow = {
	username: string;
	/** A skill's name, or a pack's slug: the end of its address. */
	name: string;
	title: string;
	description: string | null;
	/** Installs over the window browsed: all time, or the last 24 hours. */
	count: number;
	/** For a pack, how many skills it brings. */
	skillCount?: number;
};

/** Public and live, so anyone may see it in a list. */
function listable(item: Doc<'skills'> | Doc<'packs'>) {
	return item.public === true && !('deletedAt' in item && item.deletedAt !== undefined);
}

async function toRow(
	ctx: QueryCtx,
	kind: Kind,
	item: Doc<'skills'> | Doc<'packs'>,
	count: number
): Promise<BrowseRow | null> {
	const username = await model.usernameOf(ctx, item.userId);
	if (!username) return null;
	if (kind === 'skill') {
		const skill = item as Doc<'skills'>;
		return {
			username,
			name: skill.name,
			title: skill.title ?? skill.name,
			description: skill.description ?? null,
			count
		};
	}
	const pack = item as Doc<'packs'>;
	return {
		username,
		name: pack.slug,
		title: pack.name,
		description: pack.description ?? null,
		count,
		skillCount: pack.skillCount ?? pack.skills.length
	};
}

/**
 * A search that names a user rather than just a name: `@user`, `user/`,
 * `@user/skill`, `user/skill`, `@user/pack/<slug>`, or a pasted address. Null
 * for a plain name search. Names never hold a `/` or start with `@`, so either
 * means a user.
 */
function userQuery(text: string, kind: Kind): { username: string; name: string } | null {
	const address = model.parseAddress(text);
	if (address && address.kind === kind) {
		return {
			username: address.username,
			name: address.kind === 'skill' ? address.name : address.slug
		};
	}
	if (!text.startsWith('@') && !text.includes('/')) return null;

	const [user = '', ...rest] = text.replace(/^@/, '').split('/');
	// `user/pack/<slug>` on the packs page reads as `user/<slug>`
	const name = (kind === 'pack' && rest[0] === 'pack' ? rest.slice(1) : rest).join('/');
	return user ? { username: user.toLowerCase(), name: name.toLowerCase() } : null;
}

/** A user's public skills or packs whose name holds `name`, most installed first. */
async function byUser(
	ctx: QueryCtx,
	kind: Kind,
	username: string,
	name: string,
	exceptUserId?: string
) {
	const profile = await profileByUsername(ctx, username);
	if (!profile) return [];
	const items: (Doc<'skills'> | Doc<'packs'>)[] =
		kind === 'skill'
			? await model.listSkills(ctx, profile.userId)
			: await model.listPacks(ctx, profile.userId);

	const matches = (item: Doc<'skills'> | Doc<'packs'>) => {
		if (!name) return true;
		const names = 'slug' in item ? [item.slug, item.name] : [item.name, item.title ?? ''];
		return names.some((candidate) => candidate.toLowerCase().includes(name));
	};

	return items
		.filter((item) => listable(item) && matches(item) && item.userId !== exceptUserId)
		.sort((a, b) => (b.installs ?? 0) - (a.installs ?? 0))
		.slice(0, PAGE);
}

/**
 * Public skills or packs, most installed first: of all time, or of the last
 * 24 hours. With `search`, the best matches by name instead, with their all
 * time counts.
 */
export const browse = query({
	args: {
		kind: v.union(v.literal('skill'), v.literal('pack')),
		window: v.union(v.literal('all'), v.literal('day')),
		search: v.optional(v.string()),
		/** Leave out the signed in viewer's own, for adding: there is nothing of yours to add. */
		exceptMine: v.optional(v.boolean())
	},
	handler: async (ctx, args): Promise<BrowseRow[]> => {
		const table = args.kind === 'skill' ? 'skills' : 'packs';
		const viewer = args.exceptMine ? await ctx.auth.getUserIdentity() : null;
		/** Public and live, and not the viewer's own when they asked to leave those out. */
		const shown = (item: Doc<'skills'> | Doc<'packs'>) =>
			listable(item) && item.userId !== viewer?.subject;
		const rows: (BrowseRow | null)[] = [];

		const text = args.search?.trim();
		if (text) {
			const user = userQuery(text, args.kind);
			if (user) {
				for (const item of await byUser(
					ctx,
					args.kind,
					user.username,
					user.name,
					viewer?.subject
				)) {
					rows.push(await toRow(ctx, args.kind, item, item.installs ?? 0));
				}
				return rows.filter((row) => row !== null);
			}

			const found = await ctx.db
				.query(table)
				.withSearchIndex('search_name', (q) => q.search('name', text).eq('public', true))
				.take(PAGE);
			for (const item of found.filter(shown)) {
				rows.push(await toRow(ctx, args.kind, item, item.installs ?? 0));
			}
			return rows.filter((row) => row !== null);
		}

		if (args.window === 'all') {
			// most installed first; ones never installed come last, in no particular order
			const top = await ctx.db
				.query(table)
				.withIndex('by_public_and_installs', (q) => q.eq('public', true))
				.order('desc')
				.take(PAGE * 2);
			for (const item of top.filter(shown).slice(0, PAGE)) {
				rows.push(await toRow(ctx, args.kind, item, item.installs ?? 0));
			}
			return rows.filter((row) => row !== null);
		}

		// the last 24 hours: a day of hourly rows, summed per item
		const since = Math.floor(Date.now() / HOUR) * HOUR - 23 * HOUR;
		const buckets = await ctx.db
			.query('installBuckets')
			.withIndex('by_hour', (q) => q.gte('hour', since))
			.collect();
		const totals = new Map<string, number>();
		for (const bucket of buckets) {
			if (bucket.kind !== args.kind) continue;
			totals.set(bucket.itemId, (totals.get(bucket.itemId) ?? 0) + bucket.count);
		}

		const ranked = [...totals].sort((a, b) => b[1] - a[1]);
		for (const [id, count] of ranked) {
			if (rows.length >= PAGE) break;
			const item = await ctx.db.get(id as Id<'skills'> | Id<'packs'>);
			if (item && shown(item)) rows.push(await toRow(ctx, args.kind, item, count));
		}
		return rows.filter((row) => row !== null);
	}
});
