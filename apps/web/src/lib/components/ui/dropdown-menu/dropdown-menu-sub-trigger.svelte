<script lang="ts">
	import { DropdownMenu as DropdownMenuPrimitive } from 'bits-ui';
	import RiArrowRightSLine from 'remixicon-svelte/icons/arrow-right-s-line';
	import { cn } from '$lib/utils.js';
	import { getSubAnchor } from './sub-anchor.svelte';

	let {
		ref = $bindable(null),
		class: className,
		inset,
		children,
		...restProps
	}: DropdownMenuPrimitive.SubTriggerProps & {
		inset?: boolean;
	} = $props();

	const anchor = getSubAnchor();
	if (anchor) anchor.trigger = () => ref;
</script>

<DropdownMenuPrimitive.SubTrigger
	bind:ref
	data-slot="dropdown-menu-sub-trigger"
	data-inset={inset}
	class={cn(
		"flex w-full cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm whitespace-nowrap outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-inset:pl-7 data-open:bg-accent data-open:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
		className
	)}
	{...restProps}
>
	{@render children?.()}
	<RiArrowRightSLine class="cn-rtl-flip ml-auto size-4" aria-hidden="true" />
</DropdownMenuPrimitive.SubTrigger>
