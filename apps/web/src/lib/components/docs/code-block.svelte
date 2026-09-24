<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { CopyButton } from '$lib/components/ui/copy-button';

	let { children, ...rest }: HTMLAttributes<HTMLPreElement> = $props();

	// read off the rendered block, which is all the highlighter leaves us
	let text = $state('');
	const read = (node: HTMLPreElement) => {
		text = node.textContent ?? '';
	};
</script>

<div class="group relative">
	<pre {...rest} {@attach read}>{@render children?.()}</pre>
	<CopyButton
		{text}
		size="icon-xs"
		variant="ghost"
		class="absolute top-2.5 right-2.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
		aria-label="Copy code"
	/>
</div>
