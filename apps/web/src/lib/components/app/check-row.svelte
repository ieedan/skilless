<script lang="ts">
	import type { Snippet } from 'svelte';
	import { drawerItemClass } from '$lib/components/ui/drawer';
	import { cn } from '$lib/utils';
	import RiCheckLine from 'remixicon-svelte/icons/check-line';

	/** A toggle row in a drawer list. Stays open so several rows can be toggled in one go. */
	let {
		checked,
		disabled = false,
		onCheckedChange,
		align = 'center',
		children
	}: {
		checked: boolean;
		/** Shows as locked: checked but muted. */
		disabled?: boolean;
		onCheckedChange: (checked: boolean) => void;
		/** `start` for rows taller than one line, so the box sits by the first. */
		align?: 'center' | 'start';
		children: Snippet;
	} = $props();
</script>

<button
	type="button"
	role="checkbox"
	aria-checked={checked}
	{disabled}
	onclick={() => onCheckedChange(!checked)}
	class={cn(drawerItemClass, 'gap-2.5 disabled:opacity-100', align === 'start' && 'items-start')}
>
	<span
		class="flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors {align ===
		'start'
			? 'mt-0.5'
			: ''} {checked
			? disabled
				? 'border-input bg-muted text-muted-foreground'
				: 'border-primary bg-primary text-primary-foreground'
			: 'border-input'}"
	>
		{#if checked}
			<RiCheckLine class="size-3 text-current" aria-hidden="true" />
		{/if}
	</span>

	{@render children()}
</button>
