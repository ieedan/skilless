import { getContext, setContext } from 'svelte';

const MIN_HEIGHT = 240;

const KEY = Symbol('dropdown-menu-sub-anchor');

/**
 * Where a submenu's trigger sits, so its content can open level with it.
 *
 * Left to itself, floating-ui shifts a submenu that is taller than the room
 * below its trigger up the screen until it fits, which leaves the top of the
 * list far from the item that opened it. Instead the trigger's top becomes the
 * collision boundary, and the content scrolls within what is left below it.
 * Near the bottom of the screen that would leave a sliver, so it may still
 * rise far enough to keep `MIN_HEIGHT`.
 */
export class SubAnchor {
	trigger: () => HTMLElement | null = () => null;
	top = $state(0);

	measure() {
		const top = this.trigger()?.getBoundingClientRect().top ?? 0;
		this.top = Math.max(0, Math.min(top, window.innerHeight - MIN_HEIGHT));
	}
}

export function setSubAnchor() {
	return setContext(KEY, new SubAnchor());
}

export function getSubAnchor(): SubAnchor | undefined {
	return getContext(KEY);
}
