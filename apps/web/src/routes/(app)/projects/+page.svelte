<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import { APP_NAME } from '$lib/constants';
	import { projectParts, type ProjectParts } from '$lib/project';
	import { around, highlight, search, terms } from '$lib/search';
	import { SkillActions, type MenuProject } from '$lib/skill-actions.svelte';
	import ProjectMenu from '$lib/components/app/project-menu.svelte';
	import ProjectIcon from '$lib/components/app/project-icon.svelte';
	import ReadingColumn from '$lib/components/app/reading-column.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import RiSearchLine from 'remixicon-svelte/icons/search-line';

	let { data } = $props();

	// live subscriptions seeded with the server's data (see hooks.ts)
	const skills = $derived(data.skills.data ?? []);
	const projects = $derived(data.projects.data ?? []);

	/** Private repos the app cannot see. */
	const unreachable = $derived(projects.filter((project) => project.repo?.reachable === false));

	const actions = new SkillActions();

	type Project = (typeof projects)[number];

	type Row = {
		project: Project | MenuProject;
		parts: ProjectParts;
		// `search` matches on these two
		name: string;
		description?: string;
		unreachable: boolean;
		pending: boolean;
		count: number;
	};

	/**
	 * Skills bound to a project, read through `actions` so the count moves with
	 * a checkbox in the row's menu. Globals reach every project, so they would
	 * only add noise.
	 */
	function count(project: MenuProject) {
		return skills.filter((skill) => !actions.isGlobal(skill) && actions.isBound(skill, project))
			.length;
	}

	/** `fallback` is GitHub's description from the repo list, for rows in the lower list. */
	function row(project: Project | MenuProject, fallback?: string | null): Row {
		const parts = projectParts(project.key);
		const repo = 'repo' in project ? project.repo : undefined;
		return {
			project,
			parts,
			name: parts.path,
			description: repo?.description ?? fallback ?? undefined,
			unreachable: repo?.reachable === false,
			// only the first lookup shows a skeleton; after that the cached copy stands in
			// the lower list already has GitHub's copy
			pending: parts.host === 'github' && !repo && fallback === undefined,
			count: count(project)
		};
	}

	const byKey = $derived(new Map(projects.map((project) => [project.key, project])));

	/**
	 * Repos given a skill from the lower list during this visit. They become
	 * projects straight away, but stay down there until the next visit rather
	 * than jumping up the page under the open menu.
	 */
	const adopted = new SvelteSet<string>();

	const rows = $derived(
		projects.filter((project) => !adopted.has(project.key)).map((project) => row(project))
	);

	/** The app's repos that are not projects yet, most recently pushed first. */
	function otherRows(repos: Awaited<typeof data.repos>) {
		return repos.flatMap((repo) => {
			const key = `github.com/${repo.fullName.toLowerCase()}`;
			const project = byKey.get(key);
			if (project && !adopted.has(key)) return [];
			return [row(project ?? { _id: key, key, unsaved: true }, repo.description)];
		});
	}

	let query = $state('');
	const queryTerms = $derived(terms(query));
	const results = $derived(search(rows, query));
</script>

{#snippet marked(text: string)}
	<!-- one line: whitespace between segments would render as stray spaces -->
	{#each highlight(text, queryTerms) as segment, i (i)}{#if segment.match}<mark
				class="bg-primary/20 text-foreground">{segment.text}</mark
			>{:else}{segment.text}{/if}{/each}
{/snippet}

{#snippet item({ project, parts, description, unreachable, pending, count }: Row, other = false)}
	{@const unsaved = 'unsaved' in project && project.unsaved === true}
	<li class="relative flex items-center justify-between gap-4 py-3.5">
		<!-- a repo with no project yet has no page to open -->
		<svelte:element
			this={unsaved ? 'div' : 'a'}
			href={unsaved ? undefined : `/projects/${project.key}`}
			class="flex min-w-0 items-start gap-3"
		>
			<!-- stretched so the whole row is the hit target, without nesting the menu inside the link -->
			{#if !unsaved}
				<span class="absolute inset-0" aria-hidden="true"></span>
			{/if}
			<ProjectIcon {parts} size="md" class="mt-0.5" />

			<div class="flex min-w-0 flex-1 flex-col gap-1.5">
				<span class="flex min-w-0 items-center gap-2">
					<span class="truncate text-sm font-semibold text-card-foreground" title={project.key}>
						{@render marked(parts.path)}
					</span>
					<span class="shrink-0 text-xs text-muted-foreground">
						{count}
						{count === 1 ? 'skill' : 'skills'}
					</span>
				</span>

				<!-- clamped to two lines, like skill descriptions -->
				{#if description}
					<span class="line-clamp-2 text-[13px] text-muted-foreground">
						{@render marked(around(description, queryTerms))}
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
		</svelte:element>

		<div class="relative shrink-0">
			<ProjectMenu
				{project}
				{skills}
				{actions}
				onBind={other ? () => adopted.add(project.key) : undefined}
			/>
		</div>
	</li>
{/snippet}

{#snippet noMatch()}
	<p class="px-6 py-16 text-center text-sm text-muted-foreground">
		No projects match “{query.trim()}”.
	</p>
{/snippet}

<svelte:head><title>Projects · {APP_NAME}</title></svelte:head>

<ReadingColumn>
	<div class="relative mt-4 mb-2">
		<RiSearchLine
			class="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
			aria-hidden="true"
		/>
		<Input
			type="search"
			placeholder="Search projects"
			aria-label="Search projects"
			autocomplete="off"
			spellcheck="false"
			class="pl-8"
			bind:value={query}
		/>
	</div>

	{#if unreachable.length > 0}
		<p class="mb-2 rounded-md border border-border px-3 py-2.5 text-[13px] text-muted-foreground">
			{unreachable.length === 1 ? 'A private repo is' : `${unreachable.length} private repos are`} not
			shared with {APP_NAME}.
			<a
				href="{data.installUrl}?state={encodeURIComponent('/projects')}"
				class="font-medium text-foreground underline underline-offset-2"
			>
				Install the GitHub app
			</a>
			to pick which repos it can read.
		</p>
	{/if}

	<ul class="divide-y divide-border">
		{#each results as result (result.project.key)}
			{@render item(result)}
		{/each}
	</ul>

	{#await data.repos}
		{#if !query.trim()}
			<section class="mt-8 mb-8" aria-busy="true">
				<h2 class="border-b border-border pb-2 text-xs font-medium text-muted-foreground">
					Other repos
				</h2>
				<ul class="divide-y divide-border">
					{#each [0, 1, 2] as i (i)}
						<li class="flex items-start gap-3 py-3.5">
							<Skeleton class="mt-0.5 size-8 shrink-0 rounded-full" />
							<div class="flex flex-1 flex-col gap-2.5 pt-0.5">
								<Skeleton class="h-3.5 w-1/3" />
								<Skeleton class="h-3.5 w-2/3" />
							</div>
						</li>
					{/each}
				</ul>
			</section>
		{/if}
	{:then repos}
		{@const others = otherRows(repos)}
		{@const otherResults = search(others, query)}

		{#if projects.length === 0 && others.length === 0}
			<div class="flex flex-col items-center justify-center gap-2 px-8 py-24 text-center">
				<p class="text-sm text-card-foreground">No projects yet</p>
				<p class="text-sm text-muted-foreground">
					Run <code class="font-mono text-foreground">skilless add &lt;skill&gt;</code> inside a repo
					to add it here.
				</p>
			</div>
		{:else if results.length === 0 && otherResults.length === 0}
			{@render noMatch()}
		{:else if otherResults.length > 0}
			<section class="mt-8 mb-8">
				<h2 class="border-b border-border pb-2 text-xs font-medium text-muted-foreground">
					Other repos
				</h2>
				<ul class="divide-y divide-border">
					{#each otherResults as result (result.project.key)}
						{@render item(result, true)}
					{/each}
				</ul>
			</section>
		{/if}
	{/await}
</ReadingColumn>
