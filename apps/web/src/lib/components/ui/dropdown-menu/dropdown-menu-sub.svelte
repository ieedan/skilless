<script lang="ts">
	import { DropdownMenu as DropdownMenuPrimitive } from 'bits-ui';
	import { setSubAnchor } from './sub-anchor.svelte';

	let {
		open = $bindable(false),
		onOpenChange,
		...restProps
	}: DropdownMenuPrimitive.SubProps = $props();

	const anchor = setSubAnchor();
</script>

<DropdownMenuPrimitive.Sub
	bind:open
	onOpenChange={(value) => {
		// before the content mounts, so its first position already uses it
		if (value) anchor.measure();
		onOpenChange?.(value);
	}}
	{...restProps}
/>
