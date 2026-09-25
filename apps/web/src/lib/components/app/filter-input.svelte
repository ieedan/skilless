<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		value = $bindable(''),
		...restProps
	}: Omit<HTMLInputAttributes, 'value'> & {
		ref?: HTMLInputElement | null;
		value?: string;
	} = $props();
</script>

<input
	bind:this={ref}
	bind:value
	placeholder="Filter…"
	autocomplete="off"
	spellcheck="false"
	class="mx-1 mb-2 h-9 shrink-0 rounded-md border border-input bg-transparent px-3 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm"
	{...restProps}
/>
