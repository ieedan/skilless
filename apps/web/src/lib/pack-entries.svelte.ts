import { SvelteSet } from 'svelte/reactivity';

export type EntrySkill = {
	/** Its owner's, for its address. */
	username: string;
	name: string;
	title?: string;
	description?: string;
	public: boolean;
	mine: boolean;
};

export type EntryRepo = {
	found: boolean;
	description: string | null;
	skills: { name: string; description?: string; dir?: string; sole?: boolean }[];
};

/** Another pack, included in this one. */
export type EntryPack = {
	/** Its owner's username and its slug, for its address. */
	username: string;
	slug: string;
	name: string;
	description?: string;
	skillCount: number;
	countPartial: boolean;
	public: boolean;
	mine: boolean;
	owner: { name: string; image: string | null; username: string | null };
};

/** A pack entry as the pages show it: as written, with whatever it was resolved to. */
export type EntryView = {
	entry: string;
	skill: EntrySkill | null;
	repo: EntryRepo | null;
	pack: EntryPack | null;
};

/** How long a settled change waits for the live query before the server is trusted again. */
const CATCH_UP_MS = 5000;

/**
 * A pack's entries with changes shown the moment they are made. Adds and
 * removes go to the server one at a time, in order — so checking a skill and
 * unchecking it again straight away lands as both, not as a race — and each
 * stays on screen until the live query agrees, or snaps back if it failed.
 */
export class PackEntries {
	#added = $state<EntryView[]>([]);
	#removed = new SvelteSet<string>();
	#queue: Promise<unknown> = Promise.resolve();

	constructor(
		private server: () => EntryView[],
		/** Posts a change, resolving true once the server has it. */
		private send: (action: 'addEntries' | 'removeEntry', entry: string) => Promise<boolean>
	) {}

	get list(): EntryView[] {
		const server = this.server();
		// a throwaway lookup, rebuilt on every read: nothing to react to
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const there = new Set(server.map((view) => view.entry));

		return [
			...server.filter((view) => !this.#removed.has(view.entry)),
			...this.#added.filter((view) => !there.has(view.entry) && !this.#removed.has(view.entry))
		];
	}

	has(entry: string) {
		return this.list.some((view) => view.entry === entry);
	}

	add(view: EntryView) {
		if (this.has(view.entry)) return;
		this.#removed.delete(view.entry);
		if (!this.#added.some((added) => added.entry === view.entry)) this.#added.push(view);
		this.#run('addEntries', view.entry, () => this.#drop(view.entry));
	}

	remove(entry: string) {
		if (!this.has(entry)) return;
		this.#removed.add(entry);
		this.#run('removeEntry', entry, () => this.#removed.delete(entry));
	}

	#drop(entry: string) {
		this.#added = this.#added.filter((view) => view.entry !== entry);
	}

	#run(action: 'addEntries' | 'removeEntry', entry: string, undo: () => void) {
		this.#queue = this.#queue.then(async () => {
			const ok = await this.send(action, entry).catch(() => false);
			if (!ok) {
				undo();
				return;
			}
			// the live query has it by now, or something else changed it back
			setTimeout(() => {
				if (action === 'addEntries') this.#drop(entry);
				else this.#removed.delete(entry);
			}, CATCH_UP_MS);
		});
	}
}
