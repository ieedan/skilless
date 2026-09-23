<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * Caps a page's measure so a name and its description do not end up absurdly
	 * far apart on a wide display. Reading views opt in; the file editor does not,
	 * since code wants the full width.
	 */
	let { children, class: className = '' }: { children: Snippet; class?: string } = $props();
</script>

<div class="mx-auto w-full max-w-3xl px-4 md:px-6 {className}">
	{@render children()}
</div>
