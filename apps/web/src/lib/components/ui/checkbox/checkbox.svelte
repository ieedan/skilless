<script lang="ts">
	import { Checkbox as CheckboxPrimitive } from 'bits-ui';
	import RiCheckLine from 'remixicon-svelte/icons/check-line';
	import RiSubtractLine from 'remixicon-svelte/icons/subtract-line';
	import { cn, type WithoutChildrenOrChild } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		checked = $bindable(false),
		indeterminate = $bindable(false),
		class: className,
		...restProps
	}: WithoutChildrenOrChild<CheckboxPrimitive.RootProps> = $props();
</script>

<!-- the ::after gives the 16px box a finger-sized hit area -->
<CheckboxPrimitive.Root
	bind:ref
	data-slot="checkbox"
	class={cn(
		'peer relative flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-[4px] border border-input shadow-xs transition-shadow outline-none after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground',
		className
	)}
	bind:checked
	bind:indeterminate
	{...restProps}
>
	{#snippet children({ checked, indeterminate })}
		<span data-slot="checkbox-indicator" class="grid place-content-center text-current">
			{#if indeterminate}
				<RiSubtractLine class="size-3.5" aria-hidden="true" />
			{:else if checked}
				<RiCheckLine class="size-3.5" aria-hidden="true" />
			{/if}
		</span>
	{/snippet}
</CheckboxPrimitive.Root>
