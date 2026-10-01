/**
 * Arrow keys through a page's lists. Each row's link is marked `data-list-row`
 * and the list's search `data-list-search`; one handler on the document moves
 * between every marked row in page order, so a page with two lists (a
 * project's own skills, then its global ones) reads as one.
 *
 * - Down from the search goes to the first row, Up from the first row back to it.
 * - The ends stop rather than wrap: holding a key should not fling you to the top.
 * - Enter opens, as a link does. Space ticks the row's checkbox.
 *
 * Only keys pressed on a row or the search are touched, so menus, dialogs and
 * editors keep their own arrows.
 */

const ROW = '[data-list-row]';
const SEARCH = '[data-list-search]';

/** Spread onto a row's link. */
export const listRow = { 'data-list-row': '' };
/** Spread onto a list's search field. */
export const listSearch = { 'data-list-search': '' };

const rows = () =>
	[...document.querySelectorAll<HTMLElement>(ROW)].filter((row) => row.getClientRects().length > 0);

function go(target: HTMLElement | undefined) {
	if (!target) return;
	target.focus({ preventScroll: true });
	// the row, not the link, so the whole row comes into view
	(target.closest('li') ?? target).scrollIntoView({ block: 'nearest' });
}

export function onListKeydown(event: KeyboardEvent) {
	if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
	const active = document.activeElement;
	if (!(active instanceof HTMLElement)) return;

	if (active.matches(SEARCH)) {
		if (event.key !== 'ArrowDown') return;
		const first = rows()[0];
		if (!first) return;
		event.preventDefault();
		go(first);
		return;
	}

	if (!active.matches(ROW)) return;

	const all = rows();
	const at = all.indexOf(active);

	switch (event.key) {
		case 'ArrowDown':
			event.preventDefault();
			go(all[at + 1]);
			break;
		case 'ArrowUp':
			event.preventDefault();
			if (at > 0) go(all[at - 1]);
			else go([...document.querySelectorAll<HTMLElement>(SEARCH)].at(0));
			break;
		case 'Home':
			event.preventDefault();
			go(all[0]);
			break;
		case 'End':
			event.preventDefault();
			go(all.at(-1));
			break;
		case ' ': {
			const box = active.closest('li')?.querySelector<HTMLElement>('[role="checkbox"]');
			if (!box) return;
			// a link's Space scrolls the page; here it ticks the row instead
			event.preventDefault();
			box.click();
			break;
		}
	}
}
