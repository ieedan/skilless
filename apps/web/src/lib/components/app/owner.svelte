<script lang="ts">
	import Avatar from './avatar.svelte';

	let { owner }: { owner: { name: string; image: string | null } } = $props();
</script>

<span class="inline-flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
	<Avatar seed={owner.name} src={owner.image} size={20} />
	<span class="truncate">{owner.name}</span>
</span>
