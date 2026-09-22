<script lang="ts">
	import { cn } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		class: className,
		role = 'status',
		'aria-label': ariaLabel = 'Loading',
		...restProps
	}: HTMLAttributes<HTMLElement> = $props();
</script>

<i
	{role}
	aria-label={ariaLabel}
	class={cn('ri-loader-4-line size-4 animate-spin text-base leading-none', className)}
	{...restProps}
></i>
