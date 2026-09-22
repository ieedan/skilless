<script lang="ts">
	import type { Snippet } from 'svelte';
	import { useHeaderActions } from './header-actions.svelte';

	let { children }: { children: Snippet } = $props();

	const actions = useHeaderActions();

	/*
	 * The layout renders this snippet, so it outlives the page that supplied it.
	 * Between a navigation starting and this teardown running, the layout can
	 * re-render it against data the page no longer has — so snippets passed here
	 * must tolerate their own data being gone. Clearing on `beforeNavigate`
	 * instead would leave the header empty whenever a navigation is cancelled.
	 */
	$effect(() => {
		actions.current = children;
		return () => {
			actions.current = null;
		};
	});
</script>
