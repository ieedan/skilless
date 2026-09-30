<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '@skilless/platform';
	import { useConvexClient } from '@skilless/platform/client';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { APP_NAME } from '$lib/constants';
	import { UseRepos } from '$lib/hooks/use-repos.svelte';
	import { projectParts } from '$lib/project';
	import { SkillActions, type MenuProject } from '$lib/skill-actions.svelte';
	import PageActions from '$lib/components/app/page-actions.svelte';
	import ProjectMenu from '$lib/components/app/project-menu.svelte';
	import ProjectIcon from '$lib/components/app/project-icon.svelte';
	import SkillRow from '$lib/components/app/skill-row.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import RiExternalLinkLine from 'remixicon-svelte/icons/external-link-line';

	let { data } = $props();

	// Live (see +page.server.ts). Optional chained because the header actions
	// outlive this page (see PageActions).
	const skills = $derived(data.skills?.data ?? []);
	const projects = $derived(data.projects?.data ?? []);

	const key = $derived(page.params.key ?? '');
	const saved = $derived(projects.find((p) => p.key === key));

	/**
	 * A repo from the cached list that no skill has made a project yet. It gets
	 * the same page, empty; binding a skill from the menu creates the project,
	 * and `saved` takes over.
	 */
	const repos = new UseRepos(() => data.repos);
	const cached = $derived(repos.find(key));
	const project = $derived<(typeof projects)[number] | MenuProject | undefined>(
		saved ?? (cached && { _id: key, key, unsaved: true })
	);
	const description = $derived(saved?.repo?.description ?? cached?.description);
	const parts = $derived(projectParts(key));

	const actions = new SkillActions();

	const client = useConvexClient();

	// a stale GitHub description, refreshed once the page is up; see the project list
	onMount(() => {
		client.mutation(api.github.refreshStale, {}).catch(() => {});
	});

	/**
	 * Read through `actions` so toggling this project off in a row's menu takes
	 * the row away straight off. A global skill lands in every project on its
	 * own, so it is listed apart from the ones bound here.
	 */
	const bound = $derived(
		project ? skills.filter((s) => !actions.isGlobal(s) && actions.isBound(s, project)) : []
	);
	const globals = $derived(skills.filter((s) => actions.isGlobal(s)));
</script>

<svelte:head><title>{parts.path} · {APP_NAME}</title></svelte:head>

<PageActions>
	{#if parts.host !== 'other'}
		<Button href="https://{key}" target="_blank" rel="noreferrer" variant="ghost" size="sm">
			<RiExternalLinkLine />
			Open repository
		</Button>
	{/if}
</PageActions>

<header class="flex items-start gap-4 border-b border-border pt-6 pb-5 md:pt-8 md:pb-6">
	<ProjectIcon {parts} size="lg" />

	<div class="flex min-w-0 flex-1 flex-col gap-1.5">
		<h1 class="truncate text-xl font-semibold text-card-foreground" title={key}>
			{parts.path}
		</h1>

		{#if description}
			<p class="text-sm leading-relaxed text-muted-foreground">{description}</p>
		{:else if saved?.repo?.reachable === false}
			<p class="text-sm leading-relaxed text-muted-foreground">
				Private repo, not shared with {APP_NAME}.
				<a
					href="{data.installUrl}?state={encodeURIComponent(page.url.pathname)}"
					class="font-medium text-foreground underline underline-offset-2"
				>
					Install the GitHub app
				</a>
				to show its details.
			</p>
		{:else if saved && !saved.repo && !cached && parts.host === 'github'}
			<!-- only until the first lookup lands -->
			<Skeleton class="my-1 h-3.5 w-2/3" />
		{/if}
	</div>

	{#if project}
		<ProjectMenu {project} {skills} {actions} onRemoved={() => goto('/projects')} />
	{/if}
</header>

{#if project}
	{#if bound.length === 0}
		<div class="flex flex-col items-center justify-center gap-2 px-8 py-16 text-center">
			<p class="text-sm text-card-foreground">No skills in this project yet</p>
			<p class="text-sm text-muted-foreground">
				Add some from the menu above, or run
				<code class="font-mono text-foreground">skilless add &lt;skill&gt;</code> in the repo.
			</p>
		</div>
	{:else}
		<ul class="divide-y divide-border">
			{#each bound as skill (skill._id)}
				<SkillRow {skill} {projects} {actions} />
			{/each}
		</ul>
	{/if}

	{#if globals.length > 0}
		<section class="mt-8 mb-8">
			<h2 class="border-b border-border pb-2 text-xs font-medium text-muted-foreground">
				Also installed here as global skills
			</h2>
			<ul class="divide-y divide-border">
				{#each globals as skill (skill._id)}
					<SkillRow {skill} {projects} {actions} />
				{/each}
			</ul>
		</section>
	{/if}
{/if}
