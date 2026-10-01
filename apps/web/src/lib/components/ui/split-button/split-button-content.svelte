<script lang="ts">
	import { SelectContent } from '$lib/components/ui/select';
	import type { ComponentProps } from 'svelte';

	let { align = 'end', children, ...restProps }: ComponentProps<typeof SelectContent> = $props();
</script>

<SelectContent data-slot="split-button-content" {align} class="rounded-lg p-0.5" {...restProps}>
	{@render children?.()}
</SelectContent>
