<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<!-- reversed, like the dialog footer on a phone, so the primary action written last sits on top -->
<div
	bind:this={ref}
	data-slot="drawer-footer"
	class={cn('flex flex-col-reverse gap-2 px-2 pt-4 [&>*]:w-full', className)}
	{...restProps}
>
	{@render children?.()}
</div>
