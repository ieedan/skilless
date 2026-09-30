<script lang="ts">
	import { highlight } from '$lib/search';

	/** `text` with every search term in it marked, the way every searchable list shows matches. */
	let { text, terms }: { text: string; terms: string[] } = $props();
</script>

<!-- one line: whitespace between segments would render as stray spaces -->
{#each highlight(text, terms) as segment, i (i)}{#if segment.match}<mark
			class="rounded-[2px] bg-primary/25 text-foreground dark:bg-primary/70">{segment.text}</mark
		>{:else}{segment.text}{/if}{/each}
