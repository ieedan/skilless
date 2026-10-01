<script lang="ts">
	import BrowsePage from '$lib/components/app/browse-page.svelte';

	let { data } = $props();
</script>

<BrowsePage kind="skill" sort={data.sort} search={data.search} rows={data.rows} />
