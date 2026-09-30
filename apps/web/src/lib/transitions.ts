import { cubicOut } from 'svelte/easing';
import { prefersReducedMotion } from 'svelte/motion';

/**
 * Collapses a toolbar item horizontally, including the flex `gap` it takes up.
 * `slide` only animates the element's own box, so the parent's gap would still
 * appear and vanish in one frame at the end. Pulling the gap back through
 * `margin-left` lets the controls beside it give and take the space in one
 * motion. `overflow` is set only while it runs, so a focus ring is not clipped
 * at rest. (From chorus's list bulk actions.)
 */
export function collapseX(node: HTMLElement, { duration = 200 } = {}) {
	const width = node.offsetWidth;
	const gap = node.parentElement
		? parseFloat(getComputedStyle(node.parentElement).columnGap) || 0
		: 0;
	return {
		duration: prefersReducedMotion.current ? 0 : duration,
		easing: cubicOut,
		css: (t: number) =>
			`overflow: hidden; width: ${t * width}px; margin-left: ${(t - 1) * gap}px; opacity: ${t};`
	};
}
