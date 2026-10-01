<script lang="ts" generics="Item extends { id: string; name: string; description?: string }">
	import type { Snippet } from 'svelte';
	import { around, search, terms } from '$lib/search';
	import Highlighted from './highlighted.svelte';
	import RiCheckLine from 'remixicon-svelte/icons/check-line';

	let {
		items,
		isChecked,
		onToggle,
		disabled,
		badge,
		placeholder = 'Filter skills',
		empty = 'No skills yet.',
		mono = true
	}: {
		items: Item[];
		isChecked: (item: Item) => boolean;
		onToggle: (item: Item, checked: boolean) => void;
		/** Why an item cannot be toggled, if it cannot. */
		disabled?: (item: Item) => string | undefined;
		/** Anything to show beside an item's name, like a lock on a private skill. */
		badge?: Snippet<[Item]>;
		/** Names set as code, like skills; off for things named in words, like packs. */
		mono?: boolean;
		placeholder?: string;
		empty?: string;
	} = $props();

	let query = $state('');
	const queryTerms = $derived(terms(query));
	const filtered = $derived(search(items, query));
</script>

<div class="flex min-h-0 flex-col">
	<input
		bind:value={query}
		{placeholder}
		aria-label={placeholder}
		autocomplete="off"
		spellcheck="false"
		class="h-9 w-full shrink-0 rounded-md border border-input bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
	/>

	<div class="-mx-1 mt-2 max-h-[min(24rem,55dvh)] min-h-0 scroll-fade-y overflow-y-auto px-1">
		{#each filtered as item (item.id)}
			{@const checked = isChecked(item)}
			{@const reason = disabled?.(item)}
			<button
				type="button"
				role="checkbox"
				aria-checked={checked}
				disabled={reason !== undefined}
				title={reason}
				onclick={() => onToggle(item, !checked)}
				class="group/item flex w-full cursor-default items-start gap-2.5 rounded-md px-2 py-1.5 text-left text-sm outline-none select-none hover:bg-accent focus-visible:bg-accent disabled:opacity-60"
			>
				<span
					class="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors {checked
						? 'border-primary bg-primary text-primary-foreground'
						: 'border-input'}"
				>
					{#if checked}<RiCheckLine class="size-3" aria-hidden="true" />{/if}
				</span>

				<span class="flex min-w-0 flex-col gap-0.5">
					<span class="flex min-w-0 items-center gap-1.5">
						<span class={['truncate text-[13px] font-semibold', mono && 'font-mono']}>
							<Highlighted text={item.name} terms={queryTerms} />
						</span>
						{@render badge?.(item)}
					</span>
					<span class="line-clamp-1 text-xs text-muted-foreground">
						{#if reason}
							{reason}
						{:else if item.description}
							<Highlighted text={around(item.description, queryTerms)} terms={queryTerms} />
						{:else}
							No description
						{/if}
					</span>
				</span>
			</button>
		{:else}
			<p class="px-2 py-6 text-center text-xs text-muted-foreground">
				{items.length === 0 ? empty : 'Nothing matches.'}
			</p>
		{/each}
	</div>
</div>
