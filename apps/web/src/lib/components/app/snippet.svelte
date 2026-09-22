<script lang="ts">
	let { command }: { command: string } = $props();

	let copied = $state(false);

	async function copy() {
		try {
			await navigator.clipboard.writeText(command);
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch {
			// clipboard unavailable (insecure origin, denied permission) — the
			// command is right there to select by hand
		}
	}
</script>

<div
	class="flex w-[300px] items-center justify-between gap-4 border border-border bg-card py-3 pr-3.5 pl-5"
>
	<code class="font-mono text-sm text-foreground">{command}</code>

	<button
		type="button"
		onclick={copy}
		class="text-muted-foreground transition-colors hover:text-foreground"
		aria-label={copied ? 'Copied' : 'Copy command'}
	>
		<i class="{copied ? 'ri-check-line' : 'ri-file-copy-line'} text-base leading-none"></i>
	</button>
</div>
