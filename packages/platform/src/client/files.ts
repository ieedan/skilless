import type { FileLink } from '../../convex/r2.js';

export type { FileLink };

/** Most bytes of file contents to keep in memory. */
const CACHE_BYTES = 32 * 1024 * 1024;

/**
 * File contents by URL. A link's URL never points at different contents, so an
 * entry never goes stale — it only needs evicting for space, oldest use first.
 */
const cache = new Map<string, string>();
let cachedBytes = 0;

function remember(url: string, contents: string) {
	cache.set(url, contents);
	cachedBytes += contents.length;

	for (const [oldest, value] of cache) {
		if (cachedBytes <= CACHE_BYTES) break;
		cache.delete(oldest);
		cachedBytes -= value.length;
	}
}

async function fetchFile(link: FileLink): Promise<string> {
	const cached = cache.get(link.url);
	if (cached !== undefined) {
		// re-insert so it counts as the most recently used
		cache.delete(link.url);
		cache.set(link.url, cached);
		return cached;
	}

	const response = await fetch(link.url);
	if (!response.ok) throw new Error(`Could not fetch ${link.path}: ${response.status}`);

	const contents = await response.text();
	remember(link.url, contents);
	return contents;
}

/** Fetches file contents from the links `links:read` / `links:readFor` hand out. */
export async function fetchFiles(links: FileLink[]): Promise<{ path: string; contents: string }[]> {
	return await Promise.all(
		links.map(async (link) => ({ path: link.path, contents: await fetchFile(link) }))
	);
}
