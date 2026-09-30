<script lang="ts">
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLAnchorAttributes } from 'svelte/elements';
	import { receive, send, useNavTabsLink } from './nav-tabs.svelte.js';

	let {
		ref = $bindable(null),
		href,
		active = false,
		class: className,
		children,
		onpointerenter,
		onfocus,
		onblur,
		...restProps
	}: WithElementRef<HTMLAnchorAttributes, HTMLAnchorElement> & {
		href: string;
		active?: boolean;
	} = $props();

	const tabs = useNavTabsLink();
</script>

<div class="relative flex h-11 shrink-0 items-center">
	<!-- the ::after reaches halfway across the gap to each neighbour, so the pointer never lands between links -->
	<a
		bind:this={ref}
		{href}
		aria-current={active ? 'page' : undefined}
		data-slot="nav-tabs-link"
		data-active={active || undefined}
		class={cn(
			"relative z-2 inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none after:absolute after:-inset-x-0.5 after:inset-y-0 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 data-active:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
			className
		)}
		onpointerenter={(e) => {
			tabs.hovered = href;
			onpointerenter?.(e);
		}}
		onfocus={(e) => {
			tabs.hovered = href;
			onfocus?.(e);
		}}
		onblur={(e) => {
			if (tabs.hovered === href) tabs.hovered = null;
			onblur?.(e);
		}}
		{...restProps}
	>
		{@render children?.()}
	</a>

	<!-- the full height of the row, so the underline lands on its bottom edge -->
	{#if active}
		<div
			class="pointer-events-none absolute inset-x-0 bottom-0 z-1 h-0.5 rounded-full bg-foreground"
			in:receive={{ key: `${tabs.id}-active` }}
			out:send={{ key: `${tabs.id}-active` }}
		></div>
	{/if}

	{#if tabs.hovered === href}
		<div
			class="pointer-events-none absolute inset-x-0 inset-y-1.5 z-0 rounded-md bg-muted"
			in:receive={{ key: `${tabs.id}-hover` }}
			out:send={{ key: `${tabs.id}-hover` }}
		></div>
	{/if}
</div>
