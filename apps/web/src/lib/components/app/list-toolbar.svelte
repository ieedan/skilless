<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * The row above a selectable list: search, then the page's filters and
	 * actions. `mb-2` plus the list's tighter first row is the gap under it.
	 */
	let { children }: { children: Snippet } = $props();
</script>

<div class="mt-4 mb-4 flex items-center gap-2">
	{@render children()}
</div>
