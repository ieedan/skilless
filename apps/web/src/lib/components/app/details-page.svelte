<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';

	/**
	 * A page for one thing: a skill, a pack, a project. The inset is the skill
	 * page's, so the title, the rows, and the rules between them share one edge.
	 */
	let {
		header,
		headerClass,
		children
	}: {
		header?: Snippet;
		/** How the header's contents are laid out, on top of its padding and rule. */
		headerClass?: string;
		children?: Snippet;
	} = $props();
</script>

<div class="flex flex-1 flex-col px-2 md:px-6">
	{#if header}
		<header class={cn('border-b border-border pt-6 pb-5 md:pt-8 md:pb-6', headerClass)}>
			{@render header()}
		</header>
	{/if}

	{@render children?.()}
</div>
