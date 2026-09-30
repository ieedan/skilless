<script lang="ts">
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';
	import { useNavTabs } from './nav-tabs.svelte.js';

	/**
	 * Horizontal navigation between pages, after shadcn-svelte-extras' underline
	 * tabs: the same crossfading underline, and a pill that previews the tab under
	 * the pointer.
	 * Links rather than tabs, since each one goes to a page.
	 *
	 * Scrolls sideways when it runs out of room, without a scrollbar; the edges
	 * fade where there is more to see.
	 */
	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLElement>> = $props();

	const uid = $props.id();
	const tabs = useNavTabs(uid);

	let list = $state<HTMLElement | null>(null);
	let fadeStart = $state(false);
	let fadeEnd = $state(false);

	function measure() {
		if (!list) return;
		fadeStart = list.scrollLeft > 0;
		fadeEnd = list.scrollLeft + list.clientWidth < list.scrollWidth - 1;
	}

	$effect(() => {
		if (!list) return;
		const observer = new ResizeObserver(measure);
		observer.observe(list);
		return () => observer.disconnect();
	});

	const mask = $derived(
		`linear-gradient(to right, transparent, #000 ${fadeStart ? '1.5rem' : '0'}, #000 calc(100% - ${fadeEnd ? '1.5rem' : '0px'}), transparent)`
	);
</script>

<nav
	bind:this={ref}
	data-slot="nav-tabs"
	onpointerleave={() => (tabs.hovered = null)}
	class={cn('min-w-0', className)}
	{...restProps}
>
	<div
		bind:this={list}
		onscroll={measure}
		class="flex [scrollbar-width:none] items-center gap-1 overflow-x-auto [&::-webkit-scrollbar]:hidden"
		style:mask-image={fadeStart || fadeEnd ? mask : undefined}
	>
		{@render children?.()}
	</div>
</nav>
