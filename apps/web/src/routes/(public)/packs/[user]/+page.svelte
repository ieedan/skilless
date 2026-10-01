<script lang="ts">
	import UserPage from '$lib/components/app/user-page.svelte';

	let { data } = $props();
</script>

<UserPage username={data.username} user={data.user} tab="packs" />
