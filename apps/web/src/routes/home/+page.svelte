<script lang="ts">
	import { APP_DESCRIPTION, APP_NAME } from '$lib/constants';
	import Landing from '$lib/components/app/landing.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>{APP_NAME} · {APP_DESCRIPTION}</title>
</svelte:head>

<Landing signedIn={data.signedIn} />
