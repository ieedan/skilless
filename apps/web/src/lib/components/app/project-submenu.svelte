<script lang="ts">
	import { DropdownMenu as DropdownMenuPrimitive } from 'bits-ui';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { UseRepos } from '$lib/hooks/use-repos.svelte';
	import { projectParts } from '$lib/project';
	import { search, terms } from '$lib/search';
	import type { MenuProject } from '$lib/skill-actions.svelte';
	import RiCheckLine from 'remixicon-svelte/icons/check-line';
	import RiGitRepositoryLine from 'remixicon-svelte/icons/git-repository-line';
	import RiGlobalLine from 'remixicon-svelte/icons/global-line';
	import Highlighted from './highlighted.svelte';
	import ProjectIcon from './project-icon.svelte';

	let {
		projects,
		global,
		onGlobalChange,
		isBound,
		onToggle
	}: {
		/** The user's projects. Cached GitHub repos that are not projects yet are listed alongside. */
		projects: MenuProject[];
		/** A global skill resolves into every project, bound or not. */
		global: boolean;
		onGlobalChange: (global: boolean) => void;
		isBound: (project: MenuProject) => boolean;
		onToggle: (project: MenuProject, bound: boolean) => void;
	} = $props();

	let query = $state('');
	let input = $state<HTMLInputElement | null>(null);
	let content = $state<HTMLElement | null>(null);

	const needle = $derived(query.trim().toLowerCase());
	const showGlobal = $derived(!needle || 'global'.includes(needle));

	const repos = new UseRepos();

	/** A search may be for a repo newer than the cache, so it looks GitHub over again. */
	function onSearch(value: string) {
		query = value;
		repos.search(value);
	}
	const all = $derived(repos.merge(projects));

	const queryTerms = $derived(terms(query));

	/** Ranked like the projects page: the repo's own name first, then its owner. */
	const filtered = $derived(
		search(
			all.map((project) => {
				const parts = projectParts(project.key);
				return { project, parts, name: parts.path, shortName: parts.name };
			}),
			query
		)
	);

	/**
	 * The menu reads every keystroke for typeahead and uses the arrow keys to
	 * move between items, both of which would fight a text field. Keep keys in
	 * the field, except Escape to close and ArrowDown to hop into the list.
	 */
	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') return;

		event.stopPropagation();

		if (event.key === 'ArrowDown') {
			event.preventDefault();
			content
				?.querySelector<HTMLElement>('[role="menuitemcheckbox"]:not([data-disabled])')
				?.focus();
		}
	}

	const itemClass =
		'group/item flex cursor-default items-center gap-2.5 rounded-md px-2 py-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none';
</script>

{#snippet box(checked: boolean, muted = false)}
	<span
		class="flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors {checked
			? muted
				? 'border-input bg-muted text-muted-foreground'
				: 'border-primary bg-primary text-primary-foreground'
			: 'border-input opacity-0 group-focus/item:opacity-100'}"
	>
		{#if checked}
			<RiCheckLine class="size-3" aria-hidden="true" />
		{/if}
	</span>
{/snippet}

<DropdownMenu.Sub
	onOpenChange={(open) => {
		if (open) repos.open();
		else query = '';
	}}
>
	<DropdownMenu.SubTrigger>
		<RiGitRepositoryLine />
		Projects
	</DropdownMenu.SubTrigger>
	<DropdownMenu.SubContent
		bind:ref={content}
		side="left"
		sideOffset={4}
		class="flex w-72 flex-col p-0"
		onOpenAutoFocus={(event) => {
			event.preventDefault();
			input?.focus();
		}}
	>
		<input
			bind:this={input}
			bind:value={() => query, onSearch}
			{onkeydown}
			placeholder="Filter…"
			aria-label="Filter projects"
			autocomplete="off"
			spellcheck="false"
			class="h-9 w-full shrink-0 border-b border-border bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground"
		/>

		<div class="max-h-72 min-h-0 overflow-y-auto p-1">
			{#if showGlobal}
				<DropdownMenuPrimitive.CheckboxItem
					closeOnSelect={false}
					bind:checked={() => global, (value) => onGlobalChange(value)}
					class={itemClass}
				>
					{#snippet children({ checked })}
						{@render box(checked)}
						<RiGlobalLine class="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
						<span class="flex min-w-0 flex-col">
							<span>Global</span>
							<span class="text-xs text-muted-foreground">Every project, automatically</span>
						</span>
					{/snippet}
				</DropdownMenuPrimitive.CheckboxItem>

				{#if filtered.length > 0}
					<DropdownMenu.Separator />
				{/if}
			{/if}

			{#each filtered as { project, parts } (project.key)}
				<!--
					Stays open so several projects can be toggled in one go. While the
					skill is global every project gets it anyway, so the row shows as
					included and locked; the real bindings come back if global is
					switched off.
				-->
				<DropdownMenuPrimitive.CheckboxItem
					closeOnSelect={false}
					disabled={global}
					bind:checked={() => global || isBound(project), (bound) => onToggle(project, bound)}
					class={itemClass}
				>
					{#snippet children({ checked })}
						{@render box(checked, global)}

						<ProjectIcon {parts} surface="bg-popover" class={global ? 'opacity-60' : ''} />

						<span class="truncate {global ? 'text-muted-foreground' : ''}" title={project.key}>
							<Highlighted text={parts.path} terms={queryTerms} />
						</span>
					{/snippet}
				</DropdownMenuPrimitive.CheckboxItem>
			{:else}
				{#if !repos.syncing && (!showGlobal || all.length === 0)}
					<p class="px-2 py-1.5 text-xs text-muted-foreground">
						{#if all.length === 0}
							No projects yet. Run <code class="font-mono text-foreground">skilless add</code> in a repo.
						{:else}
							No projects match.
						{/if}
					</p>
				{/if}
			{/each}

			{#if repos.syncing}
				<p class="px-2 py-1.5 text-xs text-muted-foreground" aria-live="polite">Checking GitHub…</p>
			{/if}
		</div>
	</DropdownMenu.SubContent>
</DropdownMenu.Sub>
