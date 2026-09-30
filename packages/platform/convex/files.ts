'use node';

import crypto from 'node:crypto';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { ConvexError, v } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { internalAction, type ActionCtx } from './_generated/server';
import { convexError, createConvexError } from './errors';
import { parseFrontmatter, type SkillFile, type StoredFile, summarize } from './model';
import { FILE_CACHE_CONTROL, r2, toLinks } from './r2';
import { action, requireUser, secretAction } from './utils';

/*
 * Everything that writes skill file contents. They live in R2, so this is all
 * actions, and in Node so hashing and path sorting match the CLI exactly. Reads
 * are plain queries in `links.ts`.
 */

const MAX_SKILL_BYTES = 1024 * 1024;
const NUL = String.fromCharCode(0);
const ATTEMPTS = 3;

const fileValidator = v.object({ path: v.string(), contents: v.string() });

/**
 * Must stay byte for byte identical to the CLI's `hashFiles`, or every sync sees
 * a conflict that isn't there.
 */
function hashFiles(files: SkillFile[]): string {
	const hash = crypto.createHash('sha256');

	for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
		hash.update(file.path);
		hash.update(NUL);
		hash.update(file.contents);
		hash.update(NUL);
	}

	return hash.digest('hex');
}

function sha256(contents: string): string {
	return crypto.createHash('sha256').update(contents).digest('hex');
}

function validate(files: SkillFile[]) {
	let bytes = 0;

	for (const file of files) {
		if (file.contents.includes(NUL)) throw createConvexError(convexError.SkillFileNotText());
		bytes += Buffer.byteLength(file.contents, 'utf8');
	}

	if (bytes > MAX_SKILL_BYTES) throw createConvexError(convexError.SkillTooLarge());
}

async function readContents(rows: Doc<'skillFiles'>[]): Promise<SkillFile[]> {
	return await Promise.all(
		toLinks(rows).map(async (link) => {
			const response = await fetch(link.url);
			if (!response.ok) throw new Error(`Could not read ${link.path} from R2: ${response.status}`);

			return { path: link.path, contents: await response.text() };
		})
	);
}

function isSkillChanged(error: unknown): boolean {
	return (
		error instanceof ConvexError &&
		(error.data as { code?: string } | undefined)?.code === 'SKILL_CHANGED'
	);
}

/**
 * The one write path. Reads the skill, lets `change` decide the new file set,
 * uploads only contents it does not already have an object for, then commits.
 * A commit that lost a race discards its uploads and starts over from the state
 * that beat it, so `change` must be safe to call more than once.
 */
async function writeSkill(
	ctx: ActionCtx,
	args: {
		userId: string;
		name: string;
		create?: boolean;
		editedAt: number;
		change: (current: SkillFile[] | null) => SkillFile[];
	}
): Promise<Doc<'skills'>> {
	for (let attempt = 1; ; attempt++) {
		const snapshot = await ctx.runQuery(internal.skills.snapshot, {
			userId: args.userId,
			name: args.name
		});

		if (args.create && snapshot) throw createConvexError(convexError.SkillAlreadyExists());

		const files = args.change(snapshot ? await readContents(snapshot.files) : null);
		validate(files);

		const have = new Map<string, string>();
		for (const row of snapshot?.files ?? []) {
			have.set(row.sha256, row.key);
		}

		const stored: StoredFile[] = [];
		const pending: { key: string; contents: string }[] = [];

		for (const file of files) {
			const hash = sha256(file.contents);
			let key = have.get(hash);

			if (!key) {
				key = `skills/${crypto.randomUUID()}`;
				have.set(hash, key);
				pending.push({ key, contents: file.contents });
			}

			stored.push({
				path: file.path,
				key,
				sha256: hash,
				size: Buffer.byteLength(file.contents, 'utf8')
			});
		}

		const uploaded = pending.map((upload) => upload.key);

		try {
			// A bare PUT rather than `r2.store`, which also checks the key is free and
			// then syncs the component's metadata table — three more round trips, for a
			// random key and a table nothing reads. Deleting needs neither.
			await Promise.all(
				pending.map((upload) =>
					r2.client.send(
						new PutObjectCommand({
							Bucket: r2.config.bucket,
							Key: upload.key,
							Body: Buffer.from(upload.contents, 'utf8'),
							ContentType: 'text/plain; charset=utf-8',
							CacheControl: FILE_CACHE_CONTROL
						})
					)
				)
			);

			return await ctx.runMutation(internal.skills.commit, {
				userId: args.userId,
				name: args.name,
				create: args.create ?? false,
				basedOn: snapshot?.skill.contentHash ?? null,
				files: stored,
				uploaded,
				contentHash: hashFiles(files),
				...summarize(files),
				editedAt: args.editedAt
			});
		} catch (error) {
			if (uploaded.length > 0) await ctx.runMutation(internal.skills.discard, { keys: uploaded });
			if (!isSkillChanged(error) || attempt === ATTEMPTS) throw error;
		}
	}
}

/* ---------------------------------------------------------------- website */

/** Creates a skill from the website. Fails if the name is taken. */
export const create = action({
	args: { name: v.string(), files: v.array(fileValidator) },
	handler: async (ctx, args): Promise<void> => {
		const userId = await requireUser(ctx);

		await writeSkill(ctx, {
			userId,
			name: args.name,
			create: true,
			// a browser has no mtime, so a web write is as new as the moment it lands
			editedAt: Date.now(),
			change: () => args.files
		});
	}
});

/** Writes one existing file back from the website. */
export const writeFile = action({
	args: { name: v.string(), path: v.string(), contents: v.string() },
	handler: async (ctx, args): Promise<void> => {
		const userId = await requireUser(ctx);

		await writeSkill(ctx, {
			userId,
			name: args.name,
			editedAt: Date.now(),
			change: (current) => {
				if (!current) throw createConvexError(convexError.SkillNotFound());
				if (!current.some((file) => file.path === args.path)) {
					throw createConvexError(convexError.SkillFileNotFound());
				}

				return current.map((file) =>
					file.path === args.path ? { ...file, contents: args.contents } : file
				);
			}
		});
	}
});

/**
 * Removes a file, or every file beneath a directory prefix. Returns how many.
 *
 * Whether a skill may be left without a SKILL.md, or with no files at all, is
 * decided by the caller — the CLI can already produce either shape by upserting
 * a different file set, so enforcing it only here would just be inconsistent.
 */
export const deletePath = action({
	args: { name: v.string(), path: v.string() },
	handler: async (ctx, args): Promise<number> => {
		const userId = await requireUser(ctx);
		const prefix = `${args.path}/`;
		let removed = 0;

		await writeSkill(ctx, {
			userId,
			name: args.name,
			editedAt: Date.now(),
			change: (current) => {
				if (!current) throw createConvexError(convexError.SkillNotFound());

				const kept = current.filter(
					(file) => file.path !== args.path && !file.path.startsWith(prefix)
				);
				removed = current.length - kept.length;
				if (removed === 0) throw createConvexError(convexError.SkillFileNotFound());

				return kept;
			}
		});

		return removed;
	}
});

/* -------------------------------------------------------------------- api */

/** Creates or replaces a skill with exactly this file set. */
export const upsertFor = secretAction({
	args: {
		userId: v.string(),
		name: v.string(),
		files: v.array(fileValidator),
		editedAt: v.number()
	},
	handler: async (ctx, args): Promise<Doc<'skills'>> => {
		return await writeSkill(ctx, {
			userId: args.userId,
			name: args.name,
			editedAt: args.editedAt,
			change: () => args.files
		});
	}
});

/** Creates or replaces one file of an existing skill, leaving the others as they are. */
export const writeFileFor = secretAction({
	args: { userId: v.string(), name: v.string(), path: v.string(), contents: v.string() },
	handler: async (ctx, args): Promise<Doc<'skills'>> => {
		return await writeSkill(ctx, {
			userId: args.userId,
			name: args.name,
			editedAt: Date.now(),
			change: (current) => {
				if (!current) throw createConvexError(convexError.SkillNotFound());

				const rest = current.filter((file) => file.path !== args.path);
				return [...rest, { path: args.path, contents: args.contents }];
			}
		});
	}
});

/** Removes a file, or every file beneath a directory prefix. Returns how many. */
export const deletePathFor = secretAction({
	args: { userId: v.string(), name: v.string(), path: v.string() },
	handler: async (ctx, args): Promise<number> => {
		const prefix = `${args.path}/`;
		let removed = 0;

		await writeSkill(ctx, {
			userId: args.userId,
			name: args.name,
			editedAt: Date.now(),
			change: (current) => {
				if (!current) throw createConvexError(convexError.SkillNotFound());

				const kept = current.filter(
					(file) => file.path !== args.path && !file.path.startsWith(prefix)
				);
				removed = current.length - kept.length;
				if (removed === 0) throw createConvexError(convexError.SkillFileNotFound());

				return kept;
			}
		});

		return removed;
	}
});

/* ---------------------------------------------------------------- backfill */

/**
 * Fills in the stored frontmatter for skills written before it was stored.
 * Idempotent, so safe to run again: `npx convex run files:backfillFrontmatter`.
 */
export const backfillFrontmatter = internalAction({
	args: {},
	handler: async (ctx): Promise<{ updated: number }> => {
		const skills = await ctx.runQuery(internal.skills.allLive, {});

		for (const { skill, main } of skills) {
			const contents = main ? (await readContents([main]))[0].contents : '';
			const { title, description, metadata } = parseFrontmatter(contents);
			await ctx.runMutation(internal.skills.setFrontmatter, {
				skillId: skill._id,
				title,
				description,
				metadata
			});
		}

		return { updated: skills.length };
	}
});
