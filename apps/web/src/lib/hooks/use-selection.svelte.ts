import { SvelteSet } from 'svelte/reactivity';

/**
 * Checked rows for bulk actions, by id. Only the rows the filter shows count
 * as selected, so a hidden one is never acted on without being seen; and a
 * row deleted elsewhere just drops out.
 *
 * ```svelte
 * <SelectSearch checked={selection.all} indeterminate={selection.some} onCheckedChange={(c) => selection.setAll(c)} … />
 * {#each results as item}<RowCheckbox checked={selection.has(item)} onCheckedChange={(c) => selection.set(item, c)} />{/each}
 * ```
 */
export class UseSelection<T> {
	#ids = new SvelteSet<string>();
	#shown: () => T[];
	#id: (item: T) => string;

	readonly selected: T[];
	readonly all: boolean;
	/** Some but not all, for select-all's indeterminate state. */
	readonly some: boolean;

	constructor(shown: () => T[], id: (item: T) => string) {
		this.#shown = shown;
		this.#id = id;
		this.selected = $derived(shown().filter((item) => this.has(item)));
		this.all = $derived(shown().length > 0 && this.selected.length === shown().length);
		this.some = $derived(this.selected.length > 0 && !this.all);
	}

	has(item: T) {
		return this.#ids.has(this.#id(item));
	}

	set(item: T, checked: boolean) {
		if (checked) this.#ids.add(this.#id(item));
		else this.#ids.delete(this.#id(item));
	}

	/** Takes in only what the filter shows. */
	setAll(checked: boolean) {
		for (const item of this.#shown()) this.set(item, checked);
	}

	clear(items: T[] = this.selected) {
		for (const item of items) this.set(item, false);
	}
}
