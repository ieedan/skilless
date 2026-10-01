import { R2 } from '@convex-dev/r2';
import { env } from '../env.convex';
import { components } from './_generated/api';
import type { Doc } from './_generated/dataModel';

/**
 * Where skill file contents live. Configured from the `R2_*` environment
 * variables on first use, so a deployment without them still serves everything
 * that does not touch a file.
 */
export const r2 = new R2(components.r2);

/**
 * An object never changes under its key — changed contents get a new key — so
 * whatever caches it may keep it forever.
 */
export const FILE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/**
 * The public URL of an object, served from the bucket's r2.dev URL. Keys are
 * random UUIDs, so the URL is unguessable, and stable, so it caches.
 */
export function fileUrl(key: string): string {
	if (!env.R2_PUBLIC_URL) throw new Error('R2_PUBLIC_URL is not set.');
	return `${env.R2_PUBLIC_URL}/${key}`;
}

/**
 * A file to fetch. The URL is immutable: new contents always get a new one.
 * `binary` says to read it as bytes rather than text.
 */
export type FileLink = { path: string; url: string; binary?: boolean; size?: number };

export function toLinks(rows: Doc<'skillFiles'>[]): FileLink[] {
	return rows.map((row) => ({
		path: row.path,
		url: fileUrl(row.key),
		size: row.size,
		...(row.binary ? { binary: true } : {})
	}));
}
