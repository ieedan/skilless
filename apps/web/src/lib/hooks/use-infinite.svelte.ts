import type { Attachment } from 'svelte/attachments';

/**
 * Renders a long list a page at a time, adding the next page as the end
 * nears the viewport. Filtering still runs over everything; only the rows put
 * on screen are limited, since those are what cost.
 *
 * ```svelte
 * {#each list.slice(results) as item (item.id)}…{/each}
 * {#if list.more(results)}<div {@attach list.sentinel}></div>{/if}
 * ```
 */
export class UseInfinite {
	#page: number;
	#limit = $state(0);

	constructor(page = 50) {
		this.#page = page;
		this.#limit = page;
	}

	slice<T>(items: T[]): T[] {
		return items.slice(0, this.#limit);
	}

	/** Whether rows are left to show, i.e. whether to render the sentinel. */
	more(items: unknown[]) {
		return items.length > this.#limit;
	}

	/** Back to the first page. Call when what the list shows changes, e.g. a new search. */
	reset() {
		this.#limit = this.#page;
	}

	/** Put on an element after the last row. Loads a page as it comes within a screen or so. */
	sentinel: Attachment<HTMLElement> = (node) => {
		const observer = new IntersectionObserver(
			([entry]) => {
				if (!entry?.isIntersecting) return;
				this.#limit += this.#page;
				// an observer only reports changes, so re-observe to hear whether
				// the sentinel is still in range after the new rows landed
				observer.unobserve(node);
				requestAnimationFrame(() => observer.observe(node));
			},
			{ rootMargin: '0px 0px 800px 0px' }
		);
		observer.observe(node);
		return () => observer.disconnect();
	};
}
