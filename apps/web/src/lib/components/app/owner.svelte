<script lang="ts">
	import Avatar from './avatar.svelte';

	/** Who made it. With a username, it links to everything else they have shared. */
	let {
		owner,
		href
	}: { owner: { name: string; image: string | null; username?: string | null }; href?: string } =
		$props();
</script>

{#if href}
	<a
		{href}
		class="inline-flex min-w-0 items-center gap-2 rounded-sm text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
	>
		<Avatar seed={owner.name} src={owner.image} size={20} />
		<span class="truncate">{owner.name}</span>
	</a>
{:else}
	<span class="inline-flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
		<Avatar seed={owner.name} src={owner.image} size={20} />
		<span class="truncate">{owner.name}</span>
	</span>
{/if}
