<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '@skilless/platform';
	import { useConvexClient } from '@skilless/platform/client';
	import { APP_NAME } from '$lib/constants';
	import { UseInfinite } from '$lib/hooks/use-infinite.svelte';
	import { UseRepos } from '$lib/hooks/use-repos.svelte';
	import { projectParts, type ProjectParts } from '$lib/project';
	import { search, terms } from '$lib/search';
	import { SkillActions, type MenuProject } from '$lib/skill-actions.svelte';
	import ProjectMenu from '$lib/components/app/project-menu.svelte';
	import ListToolbar from '$lib/components/app/list-toolbar.svelte';
	import ProjectIcon from '$lib/components/app/project-icon.svelte';
	import ListRow from '$lib/components/app/list-row.svelte';
	import SelectSearch from '$lib/components/app/select-search.svelte';
	import SkillSubmenu from '$lib/components/app/skill-submenu.svelte';
	import { Button } from '$lib/components/ui/button';
	import { confirmDelete } from '$lib/components/ui/confirm-delete-dialog';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { UseSelection } from '$lib/hooks/use-selection.svelte';
	import { submitAction } from '$lib/submit';
	import { collapseX } from '$lib/transitions';
	import { toast } from 'svelte-sonner';
	import RiDeleteBinLine from 'remixicon-svelte/icons/delete-bin-line';
	import RiMoreFill from 'remixicon-svelte/icons/more-fill';

	let { data } = $props();

	// live subscriptions seeded with the server's data (see hooks.ts)
	const skills = $derived(data.skills.data ?? []);
	const projects = $derived(data.projects.data ?? []);

	/** Private repos the app cannot see. */
	const unreachable = $derived(projects.filter((project) => project.repo?.reachable === false));

	const actions = new SkillActions();

	/**
	 * Every repo the GitHub app can see, cached, alongside the projects so the
	 * ones without skills yet can be given one. Seeded by the server.
	 */
	const repos = new UseRepos(() => data.repos);

	const client = useConvexClient();

	// Queued once the page is up rather than in the load, which they would hold
	// up: stale GitHub descriptions, and the repo list the first time. Both land
	// through the live queries.
	onMount(() => {
		client.mutation(api.github.refreshStale, {}).catch(() => {});
		repos.open();
	});

	type Project = (typeof projects)[number];
	type Listed = Project | (MenuProject & { description: string | null });

	type Row = {
		project: Listed;
		parts: ProjectParts;
		// `search` matches on these
		name: string;
		shortName: string;
		description?: string;
		unreachable: boolean;
		pending: boolean;
	};

	/**
	 * Skills bound to a project, read through `actions` so the count moves with
	 * a checkbox in the row's menu. Globals reach every project, so they would
	 * only add noise. Worked out as a row renders, since it walks every skill.
	 */
	function count(project: MenuProject) {
		return skills.filter((skill) => !actions.isGlobal(skill) && actions.isBound(skill, project))
			.length;
	}

	function row(project: Listed): Row {
		const parts = projectParts(project.key);
		const repo = 'repo' in project ? project.repo : undefined;
		// a repo that is not a project yet has the description the cache holds
		const cached = 'unsaved' in project ? project.description : undefined;
		return {
			project,
			parts,
			name: parts.path,
			shortName: parts.name,
			description: repo?.description ?? cached ?? undefined,
			unreachable: repo?.reachable === false,
			// only the first lookup shows a skeleton; after that the cached copy stands in
			pending: parts.host === 'github' && !repo && cached === undefined
		};
	}

	// sorted by key, so a repo stays put when a skill makes it a project
	const rows = $derived(repos.merge(projects).map(row));

	let query = $state('');

	/** A search may be for a repo newer than the cache, so it looks GitHub over again. */
	function onSearch(value: string) {
		query = value;
		repos.search(value);
		list.reset();
	}

	const queryTerms = $derived(terms(query));
	const results = $derived(search(rows, query));

	/** Every repo the app can see can run to hundreds of rows, each with a menu. */
	const list = new UseInfinite();

	/** Checked rows; actions only reach the ones on screen. Keyed by key, which a repo keeps when it becomes a project. */
	const selection = new UseSelection(
		() => results,
		(row) => row.project.key
	);
	const selected = $derived(selection.selected.map((row) => row.project));

	const plural = (n: number) => `${n} ${n === 1 ? 'project' : 'projects'}`;

	/** A repo that is not a project yet has nothing to uninstall. */
	const installed = $derived(selected.filter((project) => !('unsaved' in project)));

	/** Checked when every selected project has it; checking adds it to the ones that do not. */
	const boundToAll = (skill: (typeof skills)[number]) =>
		selected.every((project) => actions.isBound(skill, project));

	function bindAll(skill: (typeof skills)[number], bound: boolean) {
		for (const project of selected) {
			if (actions.isBound(skill, project) !== bound) actions.setBinding(skill, project, bound);
		}
	}

	function uninstallSelected() {
		const doomed = [...installed];
		const title =
			doomed.length === 1
				? `Uninstall ${projectParts(doomed[0].key).path}?`
				: `Uninstall ${plural(doomed.length)}?`;
		confirmDelete({
			title,
			description:
				doomed.length === 1
					? 'Every skill is removed from this project. The skills stay in your library.'
					: 'Every skill is removed from these projects. The skills stay in your library.',
			confirm: { text: 'Uninstall' },
			onConfirm: async () => {
				// fed by live queries, so there is nothing to invalidate
				const results = await Promise.all(
					doomed.map((project) =>
						submitAction(
							'/projects?/remove',
							{ projectId: project._id },
							{ keepFocus: true, invalidate: false }
						).catch(() => null)
					)
				);
				const failed = results.filter((result) => result?.type !== 'success').length;
				if (failed > 0) toast.error(`Could not uninstall ${failed} of ${plural(doomed.length)}`);
			}
		});
	}
</script>

{#snippet item(row: Row)}
	{@const { project, parts, description, unreachable, pending } = row}
	{@const n = count(project)}
	<!-- the row's `actions` snippet shadows the page's, inside the row -->
	{@const menuActions = actions}
	<!-- a repo with no skills yet opens too: its page is where you give it some -->
	<ListRow
		title={parts.path}
		href="/projects/{project.key}"
		tooltip={project.key}
		terms={queryTerms}
		{description}
		selected={selection.has(row)}
		onSelectedChange={(checked) => selection.set(row, checked)}
	>
		{#snippet leading()}
			<ProjectIcon {parts} size="md" />
		{/snippet}
		{#snippet meta()}
			<span class="shrink-0 text-xs text-muted-foreground">
				{n}
				{n === 1 ? 'skill' : 'skills'}
			</span>
		{/snippet}
		{#snippet subline()}
			{#if pending}
				<Skeleton class="my-0.5 h-3.5 w-2/3" />
			{:else if unreachable}
				Private repo, not shared with {APP_NAME}
			{:else}
				No description
			{/if}
		{/snippet}
		{#snippet actions()}
			<ProjectMenu {project} {skills} actions={menuActions} />
		{/snippet}
	</ListRow>
{/snippet}

{#snippet noMatch()}
	<p class="px-6 py-16 text-center text-sm text-muted-foreground">
		No projects match “{query.trim()}”.
	</p>
{/snippet}

<svelte:head><title>Projects · {APP_NAME}</title></svelte:head>

<ListToolbar>
	<SelectSearch
		checked={selection.all}
		indeterminate={selection.some}
		onCheckedChange={(checked) => selection.setAll(checked)}
		selectLabel="Select all shown projects"
		placeholder="Search projects"
		label="Search projects"
		class="flex-1"
		bind:value={() => query, onSearch}
	/>

	<!-- only there while something is checked, growing in beside the search -->
	{#if selected.length > 0}
		<div transition:collapseX class="shrink-0">
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button
							{...props}
							variant="outline"
							size="icon-sm"
							aria-label="Actions for {plural(selected.length)}"
						>
							<RiMoreFill />
						</Button>
					{/snippet}
				</DropdownMenu.Trigger>

				<DropdownMenu.Content align="end">
					<DropdownMenu.Label>{plural(selected.length)} selected</DropdownMenu.Label>
					<SkillSubmenu
						{skills}
						isGlobal={(skill) => actions.isGlobal(skill)}
						isBound={boundToAll}
						onToggle={bindAll}
					/>

					<DropdownMenu.Separator />

					<!-- disabled rather than hidden when only new repos are checked, so the menu does not reshuffle -->
					<DropdownMenu.Item
						variant="destructive"
						disabled={installed.length === 0}
						onSelect={uninstallSelected}
					>
						<RiDeleteBinLine />
						{installed.length === selected.length || installed.length === 0
							? 'Uninstall'
							: `Uninstall ${installed.length}`}
					</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		</div>
	{/if}
</ListToolbar>

{#if unreachable.length > 0}
	<p class="mb-2 rounded-md border border-border px-3 py-2.5 text-[13px] text-muted-foreground">
		{unreachable.length === 1 ? 'A private repo is' : `${unreachable.length} private repos are`} not shared
		with {APP_NAME}.
		<a
			href="{data.installUrl}?state={encodeURIComponent('/projects')}"
			class="font-medium text-foreground underline underline-offset-2"
		>
			Install the GitHub app
		</a>
		to pick which repos it can read.
	</p>
{/if}

{#if rows.length === 0 && !repos.syncing}
	<div class="flex flex-col items-center justify-center gap-2 px-8 py-24 text-center">
		<p class="text-sm text-card-foreground">No projects yet</p>
		<p class="text-sm text-muted-foreground">
			Run <code class="font-mono text-foreground">skilless add &lt;skill&gt;</code> inside a repo to add
			it here.
		</p>
	</div>
{:else if results.length === 0 && !repos.syncing}
	{@render noMatch()}
{:else}
	<!-- nothing above the first row to clear, so it sits closer to the search -->
	<ul class="divide-y divide-border [&>li:first-child]:pt-2">
		{#each list.slice(results) as result (result.project.key)}
			{@render item(result)}
		{/each}

		<!-- the first lookup, or a search looking GitHub over for a newer repo -->
		{#if repos.syncing}
			{#each rows.length === 0 ? [0, 1, 2] : [0] as i (i)}
				<li class="flex items-start gap-3 py-3.5" aria-busy="true">
					<Skeleton class="mt-0.5 size-8 shrink-0 rounded-full" />
					<div class="flex flex-1 flex-col gap-2.5 pt-0.5">
						<Skeleton class="h-3.5 w-1/3" />
						<Skeleton class="h-3.5 w-2/3" />
					</div>
				</li>
			{/each}
		{/if}
	</ul>

	{#if list.more(results)}
		<div {@attach list.sentinel} aria-hidden="true"></div>
	{/if}
{/if}
