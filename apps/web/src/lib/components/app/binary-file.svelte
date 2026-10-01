<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import RiDownload2Line from 'remixicon-svelte/icons/download-2-line';
	import RiFileLine from 'remixicon-svelte/icons/file-line';

	/** A file that is not text: shown as itself when it is an image, otherwise offered to download. */
	let { path, url, size }: { path: string; url: string; size?: number | null } = $props();

	const IMAGES = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg', 'ico', 'bmp'];
	const image = $derived(IMAGES.includes(path.split('.').pop()?.toLowerCase() ?? ''));
	const name = $derived(path.split('/').pop() ?? path);

	function formatSize(bytes: number) {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
	}
</script>

<div class="flex flex-col items-start gap-4">
	{#if image}
		<!-- on a checkerboard, so transparent images still read as having edges -->
		<div
			class="max-w-full overflow-hidden rounded-lg border border-border bg-[repeating-conic-gradient(var(--muted)_0%_25%,transparent_0%_50%)] bg-size-[16px_16px]"
		>
			<img src={url} alt={name} class="block max-h-[60vh] max-w-full object-contain" />
		</div>
	{:else}
		<div class="flex items-center gap-3 rounded-lg border border-border px-4 py-3.5">
			<RiFileLine class="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
			<span class="flex min-w-0 flex-col gap-0.5">
				<span class="truncate text-sm font-medium text-card-foreground">{name}</span>
				<span class="text-[13px] text-muted-foreground">
					Binary file{size != null ? ` · ${formatSize(size)}` : ''}, so it cannot be shown as text.
				</span>
			</span>
		</div>
	{/if}

	<Button href={url} target="_blank" rel="noreferrer" download={name} variant="outline" size="sm">
		<RiDownload2Line />
		Download{image && size != null ? ` · ${formatSize(size)}` : ''}
	</Button>
</div>
