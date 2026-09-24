<script module lang="ts">
	/*
	 * Elements mdsx swaps for components in every docs page. Everything else is
	 * plain HTML, styled from `.docs-prose` in layout.css.
	 */
	export { default as pre } from './code-block.svelte';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children }: { children?: Snippet; metadata?: Record<string, unknown> } = $props();
</script>

<div class="docs-prose">
	{@render children?.()}
</div>
