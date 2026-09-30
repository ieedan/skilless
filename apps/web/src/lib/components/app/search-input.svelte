<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';
	import { Input } from '$lib/components/ui/input';
	import { cn } from '$lib/utils';
	import RiCloseLine from 'remixicon-svelte/icons/close-line';
	import RiSearchLine from 'remixicon-svelte/icons/search-line';

	/**
	 * A search field with our own clear button. The browser's (see layout.css)
	 * is a heavy glyph that cannot be restyled, so it is hidden.
	 */
	let {
		value = $bindable(''),
		class: className,
		inputClass,
		...restProps
	}: Omit<HTMLInputAttributes, 'value' | 'type' | 'files'> & {
		value?: string;
		/** On the wrapper, for sizing it. */
		class?: string;
		inputClass?: string;
	} = $props();

	let ref = $state<HTMLInputElement | null>(null);
</script>

<div class={cn('relative', className)}>
	<RiSearchLine
		class="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
		aria-hidden="true"
	/>
	<Input
		bind:ref
		bind:value
		type="search"
		autocomplete="off"
		spellcheck="false"
		class={cn('pr-8 pl-8', inputClass)}
		{...restProps}
	/>
	{#if value}
		<button
			type="button"
			aria-label="Clear search"
			class="absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
			onclick={() => {
				value = '';
				ref?.focus();
			}}
		>
			<RiCloseLine class="size-3.5" aria-hidden="true" />
		</button>
	{/if}
</div>
