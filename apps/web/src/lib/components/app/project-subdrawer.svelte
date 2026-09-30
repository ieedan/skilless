<script lang="ts">
	import * as Drawer from '$lib/components/ui/drawer';
	import { UseRepos } from '$lib/hooks/use-repos.svelte';
	import { projectParts } from '$lib/project';
	import { search, terms } from '$lib/search';
	import type { MenuProject } from '$lib/skill-actions.svelte';
	import RiArrowRightSLine from 'remixicon-svelte/icons/arrow-right-s-line';
	import RiGitRepositoryLine from 'remixicon-svelte/icons/git-repository-line';
	import RiGlobalLine from 'remixicon-svelte/icons/global-line';
	import CheckRow from './check-row.svelte';
	import FilterInput from './filter-input.svelte';
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

	const summary = $derived(
		global ? 'Global' : `${projects.filter((project) => isBound(project)).length}`
	);
</script>

<Drawer.Root
	onOpenChange={(open) => {
		if (open) repos.open();
		else query = '';
	}}
>
	<Drawer.Trigger class={Drawer.drawerItemClass}>
		<RiGitRepositoryLine />
		<span class="flex-1">Projects</span>
		<span class="text-xs text-muted-foreground tabular-nums">{summary}</span>
		<RiArrowRightSLine />
	</Drawer.Trigger>

	<!-- the sheet stays put so the header and filter do; only the list scrolls -->
	<Drawer.Content
		class="overflow-y-hidden"
		onOpenAutoFocus={(event) => {
			// on touch screens this would throw up the keyboard over the list
			if (!matchMedia('(pointer: fine)').matches) return;
			event.preventDefault();
			input?.focus();
		}}
	>
		<Drawer.Header>
			<Drawer.Title>Projects</Drawer.Title>
			<Drawer.Description>Where this skill is installed.</Drawer.Description>
		</Drawer.Header>

		<FilterInput bind:ref={input} bind:value={() => query, onSearch} aria-label="Filter projects" />

		{#if showGlobal}
			<CheckRow checked={global} onCheckedChange={onGlobalChange}>
				<RiGlobalLine class="size-5 text-muted-foreground" aria-hidden="true" />
				<span class="flex min-w-0 flex-col">
					<span>Global</span>
					<span class="text-xs text-muted-foreground">Every project, automatically</span>
				</span>
			</CheckRow>

			{#if filtered.length > 0}
				<!-- empty, so it would be the first thing a short sheet squeezes out -->
				<Drawer.Separator class="shrink-0" />
			{/if}
		{/if}

		<!-- the list scrolls on its own, under the header, filter and Global -->
		<div class="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
			{#each filtered as { project, parts } (project.key)}
				<!--
					While the skill is global every project gets it anyway, so the row
					shows as included and locked; the real bindings come back if global
					is switched off.
				-->
				<CheckRow
					checked={global || isBound(project)}
					disabled={global}
					onCheckedChange={(bound) => onToggle(project, bound)}
				>
					<ProjectIcon {parts} surface="bg-popover" class={global ? 'opacity-60' : ''} />

					<span class="truncate {global ? 'text-muted-foreground' : ''}" title={project.key}>
						<Highlighted text={parts.path} terms={queryTerms} />
					</span>
				</CheckRow>
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
	</Drawer.Content>
</Drawer.Root>
