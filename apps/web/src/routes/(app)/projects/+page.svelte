<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '@skilless/platform';
	import { useConvexClient } from '@skilless/platform/client';
	import { APP_NAME } from '$lib/constants';
	import { UseInfinite } from '$lib/hooks/use-infinite.svelte';
	import { UseRepos } from '$lib/hooks/use-repos.svelte';
	import { projectParts, type ProjectParts } from '$lib/project';
	import { around, search, terms } from '$lib/search';
	import { SkillActions, type MenuProject } from '$lib/skill-actions.svelte';
	import ProjectMenu from '$lib/components/app/project-menu.svelte';
	import Highlighted from '$lib/components/app/highlighted.svelte';
	import ProjectIcon from '$lib/components/app/project-icon.svelte';
	import SearchInput from '$lib/components/app/search-input.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton';

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
</script>

{#snippet item({ project, parts, description, unreachable, pending }: Row)}
	{@const n = count(project)}
	<li class="relative flex items-center justify-between gap-4 py-3.5">
		<!-- a repo with no skills yet opens too: its page is where you give it some -->
		<a href="/projects/{project.key}" class="flex min-w-0 items-start gap-3">
			<!-- stretched so the whole row is the hit target, without nesting the menu inside the link -->
			<span class="absolute inset-0" aria-hidden="true"></span>
			<ProjectIcon {parts} size="md" class="mt-0.5" />

			<div class="flex min-w-0 flex-1 flex-col gap-1.5">
				<span class="flex min-w-0 items-center gap-2">
					<span class="truncate text-sm font-semibold text-card-foreground" title={project.key}>
						<Highlighted text={parts.path} terms={queryTerms} />
					</span>
					<span class="shrink-0 text-xs text-muted-foreground">
						{n}
						{n === 1 ? 'skill' : 'skills'}
					</span>
				</span>

				<!-- one line at a reading width, like skill descriptions -->
				{#if description}
					<span class="max-w-2xl truncate text-[13px] text-muted-foreground">
						<Highlighted text={around(description, queryTerms)} terms={queryTerms} />
					</span>
				{:else if pending}
					<Skeleton class="my-0.5 h-3.5 w-2/3" />
				{:else if unreachable}
					<span class="text-[13px] text-muted-foreground"
						>Private repo, not shared with {APP_NAME}</span
					>
				{:else}
					<span class="text-[13px] text-muted-foreground">No description</span>
				{/if}
			</div>
		</a>

		<div class="relative shrink-0">
			<ProjectMenu {project} {skills} {actions} />
		</div>
	</li>
{/snippet}

{#snippet noMatch()}
	<p class="px-6 py-16 text-center text-sm text-muted-foreground">
		No projects match “{query.trim()}”.
	</p>
{/snippet}

<svelte:head><title>Projects · {APP_NAME}</title></svelte:head>

<SearchInput
	placeholder="Search projects"
	aria-label="Search projects"
	class="mt-4 mb-2"
	bind:value={() => query, onSearch}
/>

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
