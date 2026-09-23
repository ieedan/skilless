import * as fsu from '@/utils/fs';
import { CACHE_FILE } from '@/utils/paths';
import type { RemoteSkill } from '@/utils/types';

export type Cache = {
	version: 1;
	/** The library as the server last reported it, or null if it never has. */
	library: RemoteSkill[] | null;
	/** Per project key, the skills bound to it — globals excluded, since they bind nowhere. */
	projects: Record<string, string[]>;
};

/**
 * The last thing the server said, so commands can still answer when it cannot
 * be reached. Safe to delete — it is rebuilt by the next command that gets
 * through. Changes waiting to go the other way live in `pending.json`.
 */
export function readCache(): Cache {
	const cache = fsu.readJson<Partial<Cache>>(CACHE_FILE, {});
	return {
		version: 1,
		// a cache written before sources existed has none
		library: cache.library?.map((skill) => ({ ...skill, source: skill.source ?? null })) ?? null,
		projects: cache.projects ?? {}
	};
}

export function cacheLibrary(library: RemoteSkill[]): void {
	const cache = readCache();
	cache.library = library.map(({ name, contentHash, editedAt, updatedAt, global, source }) => ({
		name,
		contentHash,
		editedAt,
		updatedAt,
		global,
		source
	}));
	fsu.writeJson(CACHE_FILE, cache);
}

/** Takes what `getBindings` resolved, which mixes in globals — those are dropped. */
export function cacheProject(key: string, resolved: RemoteSkill[]): void {
	const cache = readCache();
	cache.projects[key] = resolved.filter((skill) => !skill.global).map((skill) => skill.name);
	fsu.writeJson(CACHE_FILE, cache);
}
