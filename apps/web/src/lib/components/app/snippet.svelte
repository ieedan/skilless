<script lang="ts">
	import { CopyButton } from '$lib/components/ui/copy-button';

	import { cn } from '$lib/utils';

	let { command, class: className }: { command: string; class?: string } = $props();
</script>

<div
	class={cn(
		'flex w-[300px] items-center justify-between gap-4 rounded-lg border border-border bg-card py-3 pr-3.5 pl-5',
		className
	)}
>
	<!--
		A read-only field rather than text, so a long command stays on one line and
		scrolls, and a click selects the lot for copying by hand.
	-->
	<input
		readonly
		value={command}
		aria-label="Command"
		spellcheck="false"
		onfocus={(event) => event.currentTarget.select()}
		class="min-w-0 flex-1 bg-transparent font-mono text-sm text-foreground outline-none"
	/>

	<CopyButton
		text={command}
		size="icon-sm"
		class="shrink-0 text-muted-foreground"
		aria-label="Copy command"
	/>
</div>
