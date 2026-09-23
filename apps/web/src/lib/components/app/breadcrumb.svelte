<script lang="ts" module>
	import type { Icon } from './file-icon.svelte';
	import RiArrowRightSLine from 'remixicon-svelte/icons/arrow-right-s-line';

	export type Crumb = {
		label: string;
		href?: string;
		icon?: Icon;
		iconClass?: string;
		/** set for skill names, which are identifiers and read as code */
		mono?: boolean;
	};
</script>

<script lang="ts">
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Button } from '$lib/components/ui/button';
	import RiMoreFill from 'remixicon-svelte/icons/more-fill';

	let { items }: { items: Crumb[] } = $props();

	/**
	 * A phone fits two crumbs. Past that, everything but the last folds into a
	 * "…" menu, so the page you are on always keeps its name.
	 */
	const folded = $derived(items.length > 2 ? items.slice(0, -1) : []);
	const mobile = $derived(items.length > 2 ? items.slice(-1) : items);
</script>

{#snippet crumb(item: Crumb, last: boolean)}
	{@const Icon = item.icon}
	<span class="flex min-w-0 items-center gap-1.5">
		{#if Icon}
			<Icon class="size-4 shrink-0 {item.iconClass}" aria-hidden="true" />
		{/if}

		{#if last || !item.href}
			<span
				class={['truncate text-foreground', item.mono && 'font-mono']}
				aria-current={last ? 'page' : undefined}>{item.label}</span
			>
		{:else}
			<a
				href={item.href}
				class={[
					'truncate text-muted-foreground transition-colors hover:text-foreground',
					item.mono && 'font-mono'
				]}
			>
				{item.label}
			</a>
		{/if}
	</span>
{/snippet}

{#snippet separator()}
	<RiArrowRightSLine class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
{/snippet}

<nav aria-label="Breadcrumb" class="flex min-w-0 items-center gap-2.5 text-sm">
	<!-- every crumb from md up -->
	<div class="hidden min-w-0 items-center gap-2.5 md:flex">
		{#each items as item, i (item.label + i)}
			{@render crumb(item, i === items.length - 1)}
			{#if i < items.length - 1}{@render separator()}{/if}
		{/each}
	</div>

	<!-- below md: the folded menu, then what is left -->
	<div class="flex min-w-0 items-center gap-2.5 md:hidden">
		{#if folded.length > 0}
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button
							{...props}
							variant="ghost"
							size="icon-xs"
							class="-mx-1 text-muted-foreground"
							aria-label="Show path"
						>
							<RiMoreFill />
						</Button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="start">
					{#each folded as item, i (item.label + i)}
						{@const Icon = item.icon}
						<DropdownMenu.Item>
							{#snippet child({ props })}
								<a {...props} href={item.href}>
									{#if Icon}<Icon class={item.iconClass} aria-hidden="true" />{/if}
									<span class={[item.mono && 'font-mono']}>{item.label}</span>
								</a>
							{/snippet}
						</DropdownMenu.Item>
					{/each}
				</DropdownMenu.Content>
			</DropdownMenu.Root>
			{@render separator()}
		{/if}

		{#each mobile as item, i (item.label + i)}
			{@render crumb(item, i === mobile.length - 1)}
			{#if i < mobile.length - 1}{@render separator()}{/if}
		{/each}
	</div>
</nav>
