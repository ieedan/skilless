<script lang="ts">
	import { CopyButton } from '$lib/components/ui/copy-button';

	let { command }: { command: string } = $props();
</script>

<div
	class="flex w-[300px] items-center justify-between gap-4 rounded-lg border border-border bg-card py-3 pr-3.5 pl-5"
>
	<code class="font-mono text-sm text-foreground">{command}</code>

	<CopyButton
		text={command}
		size="icon-sm"
		class="text-muted-foreground"
		aria-label="Copy command"
	/>
</div>
