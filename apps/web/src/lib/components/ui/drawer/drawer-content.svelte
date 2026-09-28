<script lang="ts">
	import { unstable_Drawer as DrawerPrimitive } from 'bits-ui';
	import { cn, type WithoutChildrenOrChild } from '$lib/utils.js';
	import type { Snippet } from 'svelte';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithoutChildrenOrChild<DrawerPrimitive.PopupProps> & {
		children: Snippet;
	} = $props();

	/*
	 * A bottom sheet that stacks: while a nested drawer is open, this one
	 * shrinks back behind it and peeks out above, following the child's swipe.
	 * The sheet runs `--bleed` past the bottom edge so an overshooting drag
	 * never shows a gap under it. Adapted from the bits-ui nested drawer demo.
	 */
	const popup = [
		'[--bleed:3rem] [--peek:1rem] [--stack-step:0.05]',
		'[--stack-progress:clamp(0,var(--drawer-swipe-progress),1)]',
		'[--stack-peek-offset:max(0px,calc((var(--nested-drawers)-var(--stack-progress))*var(--peek)))]',
		'[--scale-base:calc(max(0,1-(var(--nested-drawers)*var(--stack-step))))]',
		'[--scale:clamp(0,calc(var(--scale-base)+(var(--stack-step)*var(--stack-progress))),1)]',
		'[--shrink:calc(1-var(--scale))]',
		'[--height:max(0px,calc(var(--drawer-frontmost-height,var(--drawer-height))-var(--bleed)))]',
		'group/drawer relative -mb-(--bleed) flex max-h-[calc(85dvh+var(--bleed))] w-full flex-col [height:var(--drawer-height,auto)] overflow-y-auto overscroll-contain rounded-t-xl border-t bg-popover px-2 pt-2 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px)+var(--bleed))] text-popover-foreground shadow-lg outline-none touch-auto',
		'[transform-origin:50%_calc(100%-var(--bleed))] [transform:translateY(calc(var(--drawer-swipe-movement-y)-var(--stack-peek-offset)-(var(--shrink)*var(--height))))_scale(var(--scale))]',
		'[transition:transform_450ms_cubic-bezier(0.32,0.72,0,1),height_450ms_cubic-bezier(0.32,0.72,0,1),box-shadow_450ms_cubic-bezier(0.32,0.72,0,1)]',
		'data-starting-style:[transform:translateY(calc(100%-var(--bleed)+2px))] data-ending-style:[transform:translateY(calc(100%-var(--bleed)+2px))]',
		'data-ending-style:shadow-none data-ending-style:duration-[calc(var(--drawer-swipe-strength)*400ms)]',
		'data-swiping:select-none data-swiping:duration-0 data-nested-drawer-swiping:duration-0',
		'data-nested-drawer-stacked:h-[calc(var(--height)+var(--bleed))] data-nested-drawer-stacked:overflow-hidden',
		"after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:bg-transparent after:transition-[background-color] after:duration-450 after:content-[''] data-nested-drawer-open:after:bg-black/5 dark:data-nested-drawer-open:after:bg-black/30"
	].join(' ');

	const backdrop = [
		'fixed inset-0 z-50 min-h-dvh bg-black [--backdrop-opacity:0.2] dark:[--backdrop-opacity:0.6]',
		'opacity-[calc(var(--backdrop-opacity)*(1-var(--drawer-swipe-progress))*var(--drawer-backdrop-interpolate,1))]',
		'transition-opacity duration-450 ease-[cubic-bezier(0.32,0.72,0,1)]',
		'data-starting-style:opacity-0 data-ending-style:opacity-0 data-ending-style:duration-[calc(var(--drawer-swipe-strength)*400ms)] data-swiping:duration-0',
		// the root drawer's backdrop already dims the page
		'data-nested:pointer-events-none data-nested:opacity-0 data-nested:transition-none'
	].join(' ');

	// fades out while a nested drawer covers it, back in as that one is swiped away
	const fade =
		'transition-opacity duration-300 group-data-nested-drawer-open/drawer:opacity-0 group-data-nested-drawer-swiping/drawer:opacity-100';
</script>

<DrawerPrimitive.Portal>
	<DrawerPrimitive.Backdrop data-slot="drawer-backdrop" class={backdrop} />
	<DrawerPrimitive.Viewport
		data-slot="drawer-viewport"
		class="fixed inset-0 z-50 flex items-end justify-center [padding-bottom:var(--drawer-keyboard-inset)]"
	>
		<DrawerPrimitive.Popup
			bind:ref
			data-slot="drawer-content"
			class={cn(popup, className)}
			{...restProps}
		>
			<div
				aria-hidden="true"
				class="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/30 {fade}"
			></div>
			<DrawerPrimitive.Content class="flex min-h-0 flex-1 flex-col {fade}">
				{@render children()}
			</DrawerPrimitive.Content>
		</DrawerPrimitive.Popup>
	</DrawerPrimitive.Viewport>
</DrawerPrimitive.Portal>
