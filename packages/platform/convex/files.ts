'use node';

import crypto from 'node:crypto';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { ConvexError, v } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { internalAction, type ActionCtx } from './_generated/server';
import { convexError, createConvexError } from './errors';
import { bytesOf, parseFrontmatter, type SkillFile, type StoredFile, summarize } from './model';
import { FILE_CACHE_CONTROL, r2, toLinks } from './r2';
import { action, requireUser, secretAction } from './utils';

/*
 * Everything that writes skill file contents. They live in R2, so this is all
 * actions, and in Node so hashing and path sorting match the CLI exactly. Reads
 * are plain queries in `links.ts`.
 */

/**
 * Every file's bytes together: room for an image or two beside the prose. Held
 * to 3MB because binary files travel as base64, a third bigger, and the web API
 * runs where request and response bodies stop at 4.5MB.
 */
export const MAX_SKILL_BYTES = 3 * 1024 * 1024;
const NUL = String.fromCharCode(0);
const ATTEMPTS = 3;

const fileValidator = v.object({
	path: v.string(),
	contents: v.string(),
	encoding: v.optional(v.literal('base64'))
});

/**
 * Must stay byte for byte identical to the CLI's `hashFiles`, or every sync sees
 * a conflict that isn't there.
 */
export function hashFiles(files: SkillFile[]): string {
	const hash = crypto.createHash('sha256');

	for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
		hash.update(file.path);
		hash.update(NUL);
		// bytes, so binary files hash too; a text file's bytes are its UTF-8, as before
		hash.update(bytesOf(file));
		hash.update(NUL);
	}

	return hash.digest('hex');
}

function sha256(bytes: Buffer): string {
	return crypto.createHash('sha256').update(bytes).digest('hex');
}

const CONTENT_TYPES: Record<string, string> = {
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	gif: 'image/gif',
	webp: 'image/webp',
	avif: 'image/avif',
	ico: 'image/x-icon',
	pdf: 'application/pdf',
	zip: 'application/zip',
	woff: 'font/woff',
	woff2: 'font/woff2',
	ttf: 'font/ttf',
	otf: 'font/otf',
	mp3: 'audio/mpeg',
	wav: 'audio/wav',
	mp4: 'video/mp4',
	webm: 'video/webm',
	wasm: 'application/wasm'
};

/** What R2 serves a file as, so an image opens as an image. */
function contentType(file: SkillFile): string {
	if (file.encoding !== 'base64') return 'text/plain; charset=utf-8';
	const extension = file.path.split('.').pop()?.toLowerCase() ?? '';
	return CONTENT_TYPES[extension] ?? 'application/octet-stream';
}

/** Relative, forward slashes, no `..`: skills are shared now, so a path must stay inside its skill. */
function isSafePath(file: string): boolean {
	if (!file || file.includes('\\') || file.includes(NUL) || file.startsWith('/')) return false;
	if (/^[a-z]:/i.test(file)) return false;
	return file.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

function validate(files: SkillFile[]) {
	let bytes = 0;

	for (const file of files) {
		if (!isSafePath(file.path)) throw createConvexError(convexError.SkillFilePathInvalid());
		// a file sent as text must be text; anything else comes as base64
		if (file.encoding !== 'base64' && file.contents.includes(NUL)) {
			throw createConvexError(convexError.SkillFileNotText());
		}
		bytes += bytesOf(file).byteLength;
	}

	if (bytes > MAX_SKILL_BYTES) throw createConvexError(convexError.SkillTooLarge());
}

async function readContents(rows: Doc<'skillFiles'>[]): Promise<SkillFile[]> {
	return await Promise.all(
		toLinks(rows).map(async (link) => {
			const response = await fetch(link.url);
			if (!response.ok) throw new Error(`Could not read ${link.path} from R2: ${response.status}`);

			if (!link.binary) return { path: link.path, contents: await response.text() };
			const bytes = Buffer.from(await response.arrayBuffer());
			return { path: link.path, contents: bytes.toString('base64'), encoding: 'base64' as const };
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
export async function writeSkill(
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
			have.set(row.binary ? `binary:${row.sha256}` : row.sha256, row.key);
		}

		const stored: StoredFile[] = [];
		const pending: { key: string; bytes: Buffer; contentType: string }[] = [];

		for (const file of files) {
			const bytes = bytesOf(file);
			const binary = file.encoding === 'base64';
			const hash = sha256(bytes);
			// the same bytes as text and as binary are served differently, so they keep apart
			const id = binary ? `binary:${hash}` : hash;
			let key = have.get(id);

			if (!key) {
				key = `skills/${crypto.randomUUID()}`;
				have.set(id, key);
				pending.push({ key, bytes, contentType: contentType(file) });
			}

			stored.push({
				path: file.path,
				key,
				sha256: hash,
				size: bytes.byteLength,
				...(binary ? { binary: true } : {})
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
							Body: upload.bytes,
							ContentType: upload.contentType,
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
				const target = current.find((file) => file.path === args.path);
				if (!target) throw createConvexError(convexError.SkillFileNotFound());
				if (target.encoding === 'base64') throw createConvexError(convexError.SkillFileBinary());

				return current.map((file) =>
					file.path === args.path ? { path: file.path, contents: args.contents } : file
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

/**
 * Creates or replaces a skill with exactly this file set. With `keepBinary`,
 * binary files it already has and the set leaves out stay: an agent that only
 * ever sees text can rewrite a skill without losing its images.
 */
export const upsertFor = secretAction({
	args: {
		userId: v.string(),
		name: v.string(),
		files: v.array(fileValidator),
		editedAt: v.number(),
		keepBinary: v.optional(v.boolean())
	},
	handler: async (ctx, args): Promise<Doc<'skills'>> => {
		return await writeSkill(ctx, {
			userId: args.userId,
			name: args.name,
			editedAt: args.editedAt,
			change: (current) => {
				if (!args.keepBinary || !current) return args.files;
				const named = new Set(args.files.map((file) => file.path));
				const kept = current.filter((file) => file.encoding === 'base64' && !named.has(file.path));
				return [...args.files, ...kept];
			}
		});
	}
});

/** Creates or replaces one file of an existing skill, leaving the others as they are. */
export const writeFileFor = secretAction({
	args: {
		userId: v.string(),
		name: v.string(),
		path: v.string(),
		contents: v.string(),
		encoding: v.optional(v.literal('base64'))
	},
	handler: async (ctx, args): Promise<Doc<'skills'>> => {
		return await writeSkill(ctx, {
			userId: args.userId,
			name: args.name,
			editedAt: Date.now(),
			change: (current) => {
				if (!current) throw createConvexError(convexError.SkillNotFound());

				const rest = current.filter((file) => file.path !== args.path);
				return [
					...rest,
					{
						path: args.path,
						contents: args.contents,
						...(args.encoding ? { encoding: args.encoding } : {})
					}
				];
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
