<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { navigating, page } from '$app/state';
	import type { FunctionReturnType } from 'convex/server';
	import type { api } from '@skilless/platform';
	import { APP_NAME } from '$lib/constants';
	import * as NavTabs from '$lib/components/ui/nav-tabs';
	import SearchInput from './search-input.svelte';

	type BrowseRow = FunctionReturnType<typeof api.installs.browse>[number];

	/** Public skills or packs, ranked by installs: all time, or the last 24 hours. */
	let {
		kind,
		sort,
		search,
		rows
	}: {
		kind: 'skill' | 'pack';
		sort: 'all' | 'trending';
		search: string;
		rows: BrowseRow[];
	} = $props();

	const base = $derived(kind === 'skill' ? '/skills' : '/packs');
	const plural = $derived(kind === 'skill' ? 'skills' : 'packs');
	/** 22.8K rather than 22,814: the order matters, not the last digit. Exact in the tooltip. */
	const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
	const exact = new Intl.NumberFormat('en-US');

	/**
	 * What is typed. Seeded from the URL once, then the box leads: a search that
	 * lands late must not overwrite what has been typed since.
	 */
	let query = $state(untrack(() => search));
	let timer: ReturnType<typeof setTimeout> | undefined;

	/** Searches as you type, once you pause: the URL follows, so a search is still a link. */
	function onType(value: string) {
		query = value;
		clearTimeout(timer);
		timer = setTimeout(() => {
			const url = new URL(page.url);
			const text = value.trim();
			if (text) url.searchParams.set('q', text);
			else url.searchParams.delete('q');
			goto(url, { keepFocus: true, noScroll: true, replaceState: true });
		}, 250);
	}

	/** A search on its way: the list dims rather than jumping. */
	const loading = $derived(navigating.to?.url.pathname === base);

	/** A search keeps to the tab it was typed on. */
	const href = (next: string) => (next === 'all' ? base : `${base}?sort=${next}`);
</script>

<svelte:head>
	<title>{kind === 'skill' ? 'Skills' : 'Packs'} · {APP_NAME}</title>
	<meta
		name="description"
		content="The most installed {plural} on {APP_NAME}, of all time and of the last day."
	/>
</svelte:head>

<!-- <header class="flex flex-col gap-2 pt-10 pb-6">
	<h1 class="text-2xl font-semibold text-foreground">{kind === 'skill' ? 'Skills' : 'Packs'}</h1>
	<p class="text-sm text-muted-foreground">
		Public {plural} on {APP_NAME}, ranked by how often they are added.
	</p>
</header> -->

<!-- a plain GET, so a search is a link like any tab -->
<form method="GET" action={base} class="py-4">
	{#if sort !== 'all'}<input type="hidden" name="sort" value={sort} />{/if}
	<SearchInput
		name="q"
		bind:value={() => query, onType}
		placeholder={kind === 'skill' ? 'Search skills' : 'Search packs'}
		aria-label="Search {plural}"
	/>
</form>

{#if !search}
	<NavTabs.Root aria-label="Ranking" class="border-b border-border">
		<NavTabs.Link href={href('all')} active={sort === 'all'}>All time</NavTabs.Link>
		<NavTabs.Link href={href('trending')} active={sort === 'trending'}>
			Trending <span class="text-xs text-muted-foreground">24h</span>
		</NavTabs.Link>
	</NavTabs.Root>
{/if}

<div class={['transition-opacity', loading && 'opacity-50']} aria-busy={loading}>
	{#if rows.length === 0}
		<p class="py-16 text-center text-sm text-muted-foreground">
			{#if search}
				No public {plural} match “{search}”.
			{:else if sort === 'trending'}
				Nothing has been added in the last day.
			{:else}
				No public {plural} yet.
			{/if}
		</p>
	{:else}
		<!-- one header for the columns, rather than a label on every row -->
		<div
			class="flex items-center gap-4 border-b border-border pt-4 pb-2 text-xs font-medium text-muted-foreground"
			aria-hidden="true"
		>
			<span class="w-6 shrink-0 text-right">#</span>
			<span class="flex-1">{kind === 'skill' ? 'Skill' : 'Pack'}</span>
			<span class="shrink-0 text-right">
				{sort === 'trending' && !search ? 'Installs (24h)' : 'Installs'}
			</span>
		</div>

		<ol class="divide-y divide-border">
			{#each rows as row, i (`${row.username}/${row.name}`)}
				<li class="flex items-center gap-4 py-3.5">
					<span class="w-6 shrink-0 text-right text-sm text-muted-foreground tabular-nums">
						{i + 1}
					</span>
					<a
						href="{base}/{row.username}/{row.name}"
						class="flex min-w-0 flex-1 flex-col gap-1 rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
					>
						<span class="flex min-w-0 items-baseline gap-2">
							<span
								class={[
									'truncate text-sm font-semibold text-card-foreground',
									kind === 'skill' && 'font-mono'
								]}
							>
								{row.title}
							</span>
							<span class="shrink-0 text-xs text-muted-foreground">@{row.username}</span>
							{#if row.skillCount !== undefined}
								<span class="shrink-0 text-xs text-muted-foreground">
									{row.skillCount}
									{row.skillCount === 1 ? 'skill' : 'skills'}
								</span>
							{/if}
						</span>
						<span class="max-w-2xl truncate text-[13px] text-muted-foreground">
							{row.description ?? 'No description'}
						</span>
					</a>
					<span
						class="shrink-0 text-right text-sm text-foreground tabular-nums"
						title="{exact.format(row.count)} {row.count === 1 ? 'install' : 'installs'}"
					>
						{compact.format(row.count)}
					</span>
				</li>
			{/each}
		</ol>
	{/if}
</div>
