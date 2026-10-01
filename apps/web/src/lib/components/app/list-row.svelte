<script lang="ts">
	import type { Snippet } from 'svelte';
	import { listRow } from '$lib/list-nav';
	import { around } from '$lib/search';
	import Highlighted from './highlighted.svelte';
	import RowCheckbox from './row-checkbox.svelte';
	import { Spinner } from '$lib/components/ui/spinner';

	/**
	 * One row of a list: skills, packs, projects, a pack's entries. Every list
	 * shares this shape — a checkbox for bulk actions, a picture, a title and a
	 * line of description, both highlighted for the list's search, and a menu —
	 * so they read alike and search the same. Skills are the exception the
	 * props allow for: no picture, and a name set as code.
	 */
	let {
		title,
		href,
		mono = false,
		terms = [],
		tooltip,
		description,
		empty = 'No description',
		selected,
		onSelectedChange,
		selectLabel,
		busy = false,
		leading,
		meta,
		subline,
		actions
	}: {
		title: string;
		/** The whole row links here. Off-site links open in a new tab. */
		href?: string;
		/** Set the title as code, as skill names are. */
		mono?: boolean;
		/** The list's search terms, highlighted in the title and description. */
		terms?: string[];
		/** On the title, e.g. the full name when it is shortened. */
		tooltip?: string;
		description?: string | null;
		/** What the second line says without a description. */
		empty?: string;
		/** Checked for bulk actions. Leave out for a row with no checkbox. */
		selected?: boolean;
		onSelectedChange?: (selected: boolean) => void;
		selectLabel?: string;
		/** Still on its way, like a skill being added: a spinner where the checkbox goes. */
		busy?: boolean;
		/** A picture before the title: an avatar, a repo's owner. Skills have none. */
		leading?: Snippet;
		/** Small things after the title: a count, a lock, where it came from. */
		meta?: Snippet;
		/** The second line when there is no description: a skeleton, a warning. */
		subline?: Snippet;
		/** The row's own menu, on the right. */
		actions?: Snippet;
	} = $props();

	const external = $derived(href !== undefined && /^https?:/i.test(href));
</script>

<li class="group/row relative flex items-center justify-between gap-4 py-3.5">
	<div class="flex min-w-0 items-center gap-2.5">
		{#if busy}
			<!-- the checkbox's cell, so the title lines up with the rows around it -->
			<div class="ml-px flex w-9 shrink-0 justify-center text-muted-foreground">
				<Spinner />
			</div>
		{:else if selected !== undefined}
			<RowCheckbox
				checked={selected}
				onCheckedChange={(checked) => onSelectedChange?.(checked)}
				label={selectLabel ?? `Select ${title}`}
			/>
		{/if}

		<div class="flex min-w-0 items-start gap-3">
			{#if leading}
				<span class="mt-0.5 flex shrink-0">{@render leading()}</span>
			{/if}

			<div class="flex min-w-0 flex-col gap-1.5">
				<span class="flex min-w-0 items-center gap-2">
					<svelte:element
						this={href ? 'a' : 'span'}
						{href}
						target={external ? '_blank' : undefined}
						rel={external ? 'noreferrer' : undefined}
						title={tooltip}
						{...href ? listRow : {}}
						class={[
							'truncate text-sm font-semibold text-card-foreground',
							mono && 'font-mono',
							// the ring is drawn round the row, since the link itself is only the title
							"outline-none focus-visible:after:pointer-events-none focus-visible:after:absolute focus-visible:after:-inset-x-1.5 focus-visible:after:inset-y-1 focus-visible:after:rounded-md focus-visible:after:ring-2 focus-visible:after:ring-ring/50 focus-visible:after:content-['']"
						]}
					>
						{#if href}
							<!-- stretched so the whole row is the hit target, without nesting the menu inside the link -->
							<span class="absolute inset-0" aria-hidden="true"></span>
						{/if}
						<Highlighted text={title} {terms} />
					</svelte:element>
					<!-- above the stretched link, so anything clickable here is clicked, not the row -->
					{#if meta}
						<span class="relative flex min-w-0 shrink items-center gap-2">{@render meta()}</span>
					{/if}
				</span>

				<!-- one line at a reading width; the item's own page has the rest -->
				<span class="max-w-2xl truncate text-[13px] text-muted-foreground">
					{#if description}
						<Highlighted text={around(description, terms)} {terms} />
					{:else if subline}
						{@render subline()}
					{:else}
						{empty}
					{/if}
				</span>
			</div>
		</div>
	</div>

	{#if actions}
		<div class="relative flex shrink-0 items-center gap-3">{@render actions()}</div>
	{/if}
</li>
