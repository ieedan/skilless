<script lang="ts">
	import { Tabs as TabsPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';
	import { receive, send, useTabs } from './tabs.svelte.js';

	let {
		ref = $bindable(null),
		value,
		class: className,
		children,
		onpointerenter,
		onfocus,
		onblur,
		...restProps
	}: TabsPrimitive.TriggerProps = $props();

	const tabs = useTabs();
	const active = $derived(tabs.value === value);

	/** Pills belong to the default look; the line variant marks the active tab with its underline. */
	const pill =
		'pointer-events-none absolute -inset-px rounded-md group-data-[variant=line]/tabs-list:hidden';
</script>

<TabsPrimitive.Trigger
	bind:ref
	data-slot="tabs-trigger"
	class={cn(
		"relative inline-flex h-[calc(100%_-_1px)] flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 dark:text-muted-foreground dark:hover:text-foreground group-data-[variant=line]/tabs-list:data-active:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
		'group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-active:bg-transparent dark:group-data-[variant=line]/tabs-list:data-active:border-transparent dark:group-data-[variant=line]/tabs-list:data-active:bg-transparent',
		'data-active:text-foreground dark:data-active:text-foreground',
		'after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-horizontal/tabs:after:inset-x-0 group-data-horizontal/tabs:after:bottom-[-5px] group-data-horizontal/tabs:after:h-0.5 group-data-vertical/tabs:after:inset-y-0 group-data-vertical/tabs:after:-right-1 group-data-vertical/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-active:after:opacity-100',
		className
	)}
	{value}
	onpointerenter={(e) => {
		tabs.hovered = value;
		onpointerenter?.(e);
	}}
	onfocus={(e) => {
		tabs.hovered = value;
		onfocus?.(e);
	}}
	onblur={(e) => {
		if (tabs.hovered === value) tabs.hovered = null;
		onblur?.(e);
	}}
	{...restProps}
>
	<!-- the active pill glides between triggers, as in the nav tabs; the hover pill previews where it would go -->
	{#if active}
		<span
			class="{pill} bg-muted"
			in:receive={{ key: `${tabs.id}-active` }}
			out:send={{ key: `${tabs.id}-active` }}
		></span>
	{/if}
	{#if tabs.hovered === value && !active}
		<span
			class="{pill} bg-muted/80"
			in:receive={{ key: `${tabs.id}-hover` }}
			out:send={{ key: `${tabs.id}-hover` }}
		></span>
	{/if}
	<span class="relative inline-flex items-center gap-1.5">{@render children?.()}</span>
</TabsPrimitive.Trigger>
