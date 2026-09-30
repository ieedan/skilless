import { Context } from 'runed';
import { crossfade } from 'svelte/transition';
import { cubicOut } from 'svelte/easing';
import { prefersReducedMotion } from 'svelte/motion';

/** The same glide as the nav tabs' pills: nothing is measured, so it is SSR safe. */
export const [send, receive] = crossfade({
	duration: () => (prefersReducedMotion.current ? 0 : 250),
	easing: cubicOut
});

export class TabsState {
	/** The trigger under the pointer or keyboard focus, which the hover pill follows. */
	hovered = $state<string | null>(null);

	constructor(
		readonly id: string,
		private readonly getValue: () => string
	) {}

	get value() {
		return this.getValue();
	}
}

const ctx = new Context<TabsState>('tabs');

export function setTabs(state: TabsState) {
	return ctx.set(state);
}

export function useTabs() {
	return ctx.get();
}
