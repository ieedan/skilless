<script lang="ts">
	import { avatarDataUri } from '$lib/avatar';

	let {
		seed,
		size = 28,
		class: className = ''
	}: { seed: string; size?: number; class?: string } = $props();

	const src = $derived(avatarDataUri(seed));
</script>

<img
	{src}
	alt=""
	aria-hidden="true"
	width={size}
	height={size}
	style="width:{size}px;height:{size}px"
	class="shrink-0 rounded-full {className}"
/>
