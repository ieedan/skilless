import { getContext, setContext, type Snippet } from 'svelte';

const KEY = Symbol('header-actions');

export type HeaderActions = { current: Snippet | null };

/**
 * Lets a page put controls in the shell header beside the breadcrumb, rather
 * than growing a second header of its own inside the panel.
 */
export function provideHeaderActions(): HeaderActions {
	const actions: HeaderActions = $state({ current: null });
	setContext(KEY, actions);
	return actions;
}

export function useHeaderActions(): HeaderActions {
	return getContext<HeaderActions>(KEY);
}
