<script lang="ts">
	import { APP_NAME } from '$lib/constants';
	import EntryList from '$lib/components/app/entry-list.svelte';
	import ReadingColumn from '$lib/components/app/reading-column.svelte';

	let { data } = $props();
</script>

<svelte:head><title>{data.skill.name} · {APP_NAME}</title></svelte:head>

<ReadingColumn>
	<EntryList entries={data.entries} base="/skills/{data.skill.name}" />
</ReadingColumn>
