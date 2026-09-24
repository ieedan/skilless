<script lang="ts">
	import { DropdownMenu as DropdownMenuPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';
	import { getSubAnchor } from './sub-anchor.svelte';

	let {
		ref = $bindable(null),
		class: className,
		collisionPadding,
		...restProps
	}: DropdownMenuPrimitive.SubContentProps = $props();

	const anchor = getSubAnchor();

	/** Nothing above the trigger's top, so the content lines up with it (see SubAnchor). */
	const padding = $derived(
		collisionPadding ?? { top: anchor?.top ?? 8, bottom: 8, left: 8, right: 8 }
	);
</script>

<DropdownMenuPrimitive.SubContent
	bind:ref
	data-slot="dropdown-menu-sub-content"
	collisionPadding={padding}
	class={cn(
		'z-50 max-h-(--bits-floating-available-height) min-w-[96px] origin-(--bits-dropdown-menu-content-transform-origin) overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
		className
	)}
	{...restProps}
/>
