import { api } from '@skilless/platform';
import { useConvexClient, useQuery } from '@skilless/platform/client';
import type { FunctionReturnType } from 'convex/server';
import type { UseQueryReturn } from 'convex-svelte';
import type { MenuProject } from '$lib/skill-actions.svelte';

/**
 * The user's GitHub repos, cached in Convex so a project picker lists them
 * without waiting on GitHub. The first picker ever opened fills the cache;
 * after that it is only looked up again when someone searches, since what
 * they are after may be a repo newer than the cache.
 *
 * Create it during component init: it subscribes to the cache.
 */
export class UseRepos {
	#client = useConvexClient();
	#query: UseQueryReturn<typeof api.github.cachedRepos>;
	/** One fresh lookup per open, however many keys the search takes. */
	#searched = false;

	/** `initial` is the cache as the server loaded it, so the first render has the repos. */
	constructor(initial?: () => FunctionReturnType<typeof api.github.cachedRepos> | undefined) {
		this.#query = useQuery(api.github.cachedRepos, {}, () => ({ initialData: initial?.() }));
	}

	/** Nothing cached yet and a lookup on its way, or a search looking again. */
	get syncing() {
		return this.#query.data?.syncing ?? false;
	}

	/**
	 * Fills the cache the first time. Call when a picker opens. The server
	 * decides whether a look is due (a first fill, or a cache from before it
	 * knew which repos have skills), so asking is cheap.
	 */
	open() {
		this.#searched = false;
		this.#sync(false);
	}

	/** Looks again, once per open. Call as the search changes. */
	search(query: string) {
		if (this.#searched || !query.trim()) return;
		this.#searched = true;
		this.#sync(true);
	}

	/**
	 * The projects, plus every cached repo that is not one yet as an unsaved row
	 * (binding a skill to it creates the project). Sorted by key rather than
	 * projects first, so a repo stays put when a skill makes it a project.
	 */
	merge<Project extends { _id: string; key: string }>(
		projects: Project[]
	): (Project | (MenuProject & { description: string | null }))[] {
		// a throwaway lookup, rebuilt on every call: nothing to react to
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const keys = new Set(projects.map((project) => project.key));
		const repos = (this.#query.data?.repos ?? [])
			.filter((repo) => !keys.has(repo.key))
			.map((repo) => ({
				_id: repo.key,
				key: repo.key,
				unsaved: true,
				description: repo.description
			}));
		return [...projects, ...repos].sort((a, b) => a.key.localeCompare(b.key));
	}

	/** Whether code search found skills in a cached repo; undefined when it could not say. */
	hasSkills(key: string): boolean | undefined {
		return this.#query.data?.repos.find((repo) => repo.key === key)?.hasSkills;
	}

	/** A cached repo by project key, for the page of one that is not a project yet. */
	find(key: string) {
		return this.#query.data?.repos.find((repo) => repo.key === key);
	}

	#sync(force: boolean) {
		// best effort: the cache, however old, still stands
		this.#client.mutation(api.github.syncRepos, { force }).catch(() => {});
	}
}
