<script lang="ts">
	import { enhance } from '$app/forms';
	import { beforeNavigate } from '$app/navigation';
	import { APP_NAME } from '$lib/constants';
	import CodeEditor from '$lib/components/app/code-editor.svelte';
	import EntryList from '$lib/components/app/entry-list.svelte';
	import PageActions from '$lib/components/app/page-actions.svelte';
	import ReadingColumn from '$lib/components/app/reading-column.svelte';
	import { CopyButton } from '$lib/components/ui/copy-button';
	import { LoadingButton } from '$lib/components/ui/loading-button';
	import RiCheckLine from 'remixicon-svelte/icons/check-line';
	import RiSaveLine from 'remixicon-svelte/icons/save-line';
	import { prefersReducedMotion } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';
	import { scale, slide } from 'svelte/transition';

	let { data, form } = $props();

	/**
	 * Read through optional chains because the Save control is rendered by the
	 * layout, not here (see PageActions). The layout outlives this page, so on the
	 * way out it can re-render that snippet once `data` has moved on to the next
	 * route and `file` is already gone.
	 */
	const file = $derived(data.file);
	const directory = $derived(data.directory);

	/**
	 * The server's copy once it has streamed in, or as of the last save. Cleared
	 * only when the path changes, so nothing blanks the editor into its loading
	 * state while it already has the file.
	 */
	let saved = $state<string>();
	let failed = $state<string>();
	let loadedPath: string | undefined;

	$effect(() => {
		const path = file?.path;
		const pending = file?.contents;
		if (!pending) return;

		if (path !== loadedPath) {
			loadedPath = path;
			saved = undefined;
			failed = undefined;
		}

		let stale = false;
		pending.then(
			(contents) => {
				if (!stale) saved = contents;
			},
			(error: unknown) => {
				if (!stale) failed = error instanceof Error ? error.message : 'Could not load this file.';
			}
		);
		return () => (stale = true);
	});

	// A writable derived: edits assign straight to it, and it reverts to the
	// server's copy whenever that changes — navigating to another file, or
	// completing a save (which puts back anything typed meanwhile).
	let draft = $derived(saved ?? '');
	let saving = $state(false);

	const dirty = $derived(saved !== undefined && draft !== saved);

	let formEl = $state<HTMLFormElement | null>(null);
	const submit = () => formEl?.requestSubmit();

	/**
	 * Save grows in from nothing once there is something to save, pushing the
	 * copy button aside, and folds away again after a save lands. Width comes
	 * from `slide`; the fade keeps the half-revealed label from looking clipped.
	 */
	function reveal(node: Element, { duration }: { duration: number }) {
		const width = slide(node, {
			axis: 'x',
			duration: prefersReducedMotion.current ? 0 : duration,
			easing: cubicOut
		});
		return { ...width, css: (t: number, u: number) => `${width.css?.(t, u)};opacity:${t}` };
	}

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
		<EntryList
			entries={directory.entries}
			contents={directory.contents}
			base="/skills/{data.skill.name}"
		/>
	</ReadingColumn>
{:else}
	<!-- The breadcrumb already names the file, so Save goes up there rather than in a second header. -->
	<PageActions>
		<!--
			One flex item rather than two, so the header's gap does not leave a hole
			where Save will be. The gap before Save lives inside its own wrapper and
			grows with it.
		-->
		<div class="flex items-center">
			<!-- the draft, not the saved copy: it is what the editor is showing. Desktop only; rarely wanted on a phone -->
			<CopyButton
				text={draft}
				size="icon-sm"
				class="text-muted-foreground max-md:hidden"
				aria-label="Copy file contents"
			/>

			<!-- stays mounted even while Save is hidden, so Cmd/Ctrl-S still has something to submit -->
			<form
				bind:this={formEl}
				method="POST"
				action="?/save"
				use:enhance={({ formData }) => {
					saving = true;
					const submitted = String(formData.get('contents') ?? '');
					return async ({ result, update }) => {
						// What we sent is now the server's copy, so there is nothing to
						// reload: re-running every load would only hold the spinner up.
						if (result.type === 'success') {
							const typed = draft;
							saved = submitted;
							// keep anything typed while the save was in flight
							draft = typed;
						}
						await update({ reset: false, invalidateAll: false });
						saving = false;
					};
				}}
			>
				<input type="hidden" name="contents" value={draft} />
				{#if dirty || saving}
					<!-- anchored right, so the button appears to slide in from the edge as the box widens -->
					<!-- on a phone the floating check below saves instead -->
					<div class="flex justify-end pl-2 max-md:hidden" transition:reveal={{ duration: 200 }}>
						<LoadingButton type="submit" size="sm" loading={saving}>
							<RiSaveLine />
							Save
						</LoadingButton>
					</div>
				{/if}
			</form>
		</div>
	</PageActions>

	<div class="flex min-h-full flex-col">
		{#if form?.message}
			<p class="border-b border-border px-4 py-3 text-[13px] text-destructive md:px-7" role="alert">
				{form.message}
			</p>
		{/if}

		<!-- Cmd/Ctrl-S saves from inside the editor. -->
		<div class="min-h-0 flex-1 px-4 py-4 md:px-7 md:py-6">
			{#if saved !== undefined}
				<CodeEditor bind:value={draft} path={file?.path ?? ''} onSave={submit} />
			{:else if failed}
				<p class="text-[13px] text-destructive" role="alert">{failed}</p>
			{:else}
				<!-- a few ragged lines where the code will be -->
				<div class="flex flex-col gap-3" role="status" aria-label="Loading file">
					{#each [40, 72, 56, 64, 28, 48] as width, i (i)}
						<div class="h-3 animate-pulse rounded-sm bg-muted" style="width: {width}%"></div>
					{/each}
				</div>
			{/if}
		</div>
	</div>

	<!-- Save on a phone: a round check in the corner, there only while there is something to save. -->
	{#if dirty || saving}
		<div
			class="fixed right-5 bottom-5 z-40 md:hidden"
			in:scale={{ start: 0.6, duration: prefersReducedMotion.current ? 0 : 200, easing: cubicOut }}
			out:scale={{ start: 0.6, duration: prefersReducedMotion.current ? 0 : 150, easing: cubicOut }}
		>
			<!-- stays solid while saving: it floats over code, and a see-through button reads as broken -->
			<LoadingButton
				size="icon-lg"
				class="rounded-full shadow-lg disabled:opacity-100"
				loading={saving}
				onclick={submit}
				aria-label="Save changes"
			>
				<RiCheckLine class="size-5" />
			</LoadingButton>
		</div>
	{/if}
{/if}
