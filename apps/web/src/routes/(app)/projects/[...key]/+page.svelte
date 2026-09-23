<script lang="ts">
	import { page } from '$app/state';
	import { APP_NAME } from '$lib/constants';
	import { projectParts } from '$lib/project';
	import { SkillActions } from '$lib/skill-actions.svelte';
	import PageActions from '$lib/components/app/page-actions.svelte';
	import ProjectIcon from '$lib/components/app/project-icon.svelte';
	import ReadingColumn from '$lib/components/app/reading-column.svelte';
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
	const project = $derived(projects.find((p) => p.key === key));
	const parts = $derived(projectParts(key));

	const actions = new SkillActions();

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

<ReadingColumn>
	<header class="flex items-start gap-4 border-b border-border pt-6 pb-5 md:pt-8 md:pb-6">
		<ProjectIcon {parts} size="lg" />

		<div class="flex min-w-0 flex-1 flex-col gap-1.5">
			<h1 class="truncate text-xl font-semibold text-card-foreground" title={key}>
				{parts.path}
			</h1>

			{#await data.description}
				{#if parts.host === 'github'}
					<Skeleton class="my-1 h-3.5 w-2/3" />
				{/if}
			{:then description}
				{#if description}
					<p class="text-sm leading-relaxed text-muted-foreground">{description}</p>
				{/if}
			{/await}
		</div>
	</header>

	{#if project}
		{#if bound.length === 0}
			<div class="flex flex-col items-center justify-center gap-2 px-8 py-16 text-center">
				<p class="text-sm text-card-foreground">No skills in this project yet</p>
				<p class="text-sm text-muted-foreground">
					Run <code class="font-mono text-foreground">skilless add &lt;skill&gt;</code> in the repo, or
					pick this project from a skill's menu.
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
</ReadingColumn>
