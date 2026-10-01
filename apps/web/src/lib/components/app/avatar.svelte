<script lang="ts">
	import { avatarDataUri } from '$lib/avatar';

	let {
		seed,
		src,
		size = 28,
		class: className = ''
	}: {
		seed: string;
		/** A real picture, e.g. the GitHub avatar. The generated one stands in without it, or if it fails to load. */
		src?: string | null;
		size?: number;
		class?: string;
	} = $props();

	let failed = $state(false);

	const picture = $derived(src && !failed ? src : null);
	const fallback = $derived(avatarDataUri(seed));
</script>

<img
	src={picture ?? fallback}
	alt=""
	aria-hidden="true"
	width={size}
	height={size}
	style="width:{size}px;height:{size}px"
	referrerpolicy="no-referrer"
	onerror={() => (failed = true)}
	class="shrink-0 rounded-full bg-muted object-cover {className}"
/>
