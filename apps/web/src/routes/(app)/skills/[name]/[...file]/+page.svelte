<script lang="ts">
	import { enhance } from '$app/forms';
	import { beforeNavigate } from '$app/navigation';
	import { APP_NAME } from '$lib/constants';
	import CodeEditor from '$lib/components/app/code-editor.svelte';
	import EntryList from '$lib/components/app/entry-list.svelte';
	import PageActions from '$lib/components/app/page-actions.svelte';
	import ReadingColumn from '$lib/components/app/reading-column.svelte';
	import { LoadingButton } from '$lib/components/ui/loading-button';

	let { data, form } = $props();

	/**
	 * Read through optional chains because the Save control is rendered by the
	 * layout, not here (see PageActions). The layout outlives this page, so on the
	 * way out it can re-render that snippet once `data` has moved on to the next
	 * route and `file` is already gone.
	 */
	const file = $derived(data.file);
	const directory = $derived(data.directory);

	// A writable derived: edits assign straight to it, and it reverts to the
	// server's copy whenever that changes — navigating to another file, or
	// completing a save.
	let draft = $derived(file?.contents ?? '');
	let saving = $state(false);

	const dirty = $derived(file !== undefined && draft !== file.contents);

	let formEl = $state<HTMLFormElement | null>(null);
	const submit = () => formEl?.requestSubmit();

	// Guard both ways out: the router for in-app links, and the browser for
	// closing, reloading or navigating away entirely.
	beforeNavigate((navigation) => {
		if (!dirty) return;
		if (!confirm('You have unsaved changes to this file. Leave without saving?')) {
			navigation.cancel();
		}
	});
</script>

<svelte:head>
	<title>{file?.path ?? directory?.path} · {data.skill.name} · {APP_NAME}</title>
</svelte:head>

<svelte:window
	onbeforeunload={(event) => {
		if (!dirty) return;
		event.preventDefault();
	}}
/>

{#if directory}
	<ReadingColumn>
		<EntryList entries={directory.entries} base="/skills/{data.skill.name}" />
	</ReadingColumn>
{:else}
	<!-- The breadcrumb already names the file, so Save goes up there rather than in a second header. -->
	<PageActions>
		{#if dirty}
			<span class="text-[13px] text-muted-foreground">Unsaved</span>
		{/if}

		<form
			bind:this={formEl}
			method="POST"
			action="?/save"
			use:enhance={() => {
				saving = true;
				return async ({ update }) => {
					await update({ reset: false });
					saving = false;
				};
			}}
		>
			<input type="hidden" name="contents" value={draft} />
			<LoadingButton type="submit" size="sm" loading={saving} disabled={!dirty}>
				<i class="ri-save-line"></i>
				Save
			</LoadingButton>
		</form>
	</PageActions>

	<div class="flex min-h-full flex-col">
		{#if form?.message}
			<p class="border-b border-border px-7 py-3 text-[13px] text-destructive" role="alert">
				{form.message}
			</p>
		{/if}

		<!-- Cmd/Ctrl-S saves from inside the editor. -->
		<div class="min-h-0 flex-1 px-7 py-6">
			<CodeEditor bind:value={draft} path={file?.path ?? ''} onSave={submit} />
		</div>
	</div>
{/if}
