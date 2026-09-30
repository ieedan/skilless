import { Context } from 'runed';
import { crossfade } from 'svelte/transition';
import { cubicOut } from 'svelte/easing';
import { prefersReducedMotion } from 'svelte/motion';

/**
 * The underline and hover pill glide between links by crossfading one element out of the old link
 * and into the new. Nothing is measured, so the server renders the underline under
 * the active link and hydration has nothing to correct.
 */
export const [send, receive] = crossfade({
	duration: () => (prefersReducedMotion.current ? 0 : 250),
	easing: cubicOut
});

class NavTabsState {
	/** The link under the pointer or keyboard focus, which the hover pill follows. */
	hovered = $state<string | null>(null);

	constructor(readonly id: string) {}
}

const ctx = new Context<NavTabsState>('nav-tabs');

export function useNavTabs(id: string) {
	return ctx.set(new NavTabsState(id));
}

export function useNavTabsLink() {
	return ctx.get();
}
