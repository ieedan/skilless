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
	import DetailsPage from '$lib/components/app/details-page.svelte';
	import PageActions from '$lib/components/app/page-actions.svelte';
	import ProjectMenu from '$lib/components/app/project-menu.svelte';
	import ProjectIcon from '$lib/components/app/project-icon.svelte';
	import SkillRow from '$lib/components/app/skill-row.svelte';
	import AddSkillsModal, { type Picked } from '$lib/components/app/add-skills-modal.svelte';
	import ListToolbar from '$lib/components/app/list-toolbar.svelte';
	import SelectSearch from '$lib/components/app/select-search.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { search, terms } from '$lib/search';
	import { collapseX } from '$lib/transitions';
	import { UseSelection } from '$lib/hooks/use-selection.svelte';
	import RiAddLine from 'remixicon-svelte/icons/add-line';
	import RiFileCopyLine from 'remixicon-svelte/icons/file-copy-line';
	import RiGitRepositoryLine from 'remixicon-svelte/icons/git-repository-line';
	import RiGlobalLine from 'remixicon-svelte/icons/global-line';
	import RiLinkUnlinkM from 'remixicon-svelte/icons/link-unlink-m';
	import RiMoreFill from 'remixicon-svelte/icons/more-fill';

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

	type Skill = (typeof skills)[number];

	/* ------------------------------------------------------ search, bulk */

	let query = $state('');
	const queryTerms = $derived(terms(query));
	const boundResults = $derived(search(bound, query));
	const globalResults = $derived(search(globals, query));

	/** One selection across both lists, so a search can take in either. */
	const selection = new UseSelection(
		() => [...boundResults, ...globalResults],
		(skill) => skill._id
	);
	const selected = $derived(selection.selected);

	const count = (n: number) => `${n} ${n === 1 ? 'skill' : 'skills'}`;
	/** "Make global" when it covers the whole selection (or none of it); "Make 2 global" when only some qualify. */
	const only = (eligible: Skill[], verb: string, rest: string) =>
		eligible.length === 0 || eligible.length === selected.length
			? `${verb} ${rest}`
			: `${verb} ${eligible.length} ${rest}`;
	const globalable = $derived(selected.filter((skill) => !actions.isGlobal(skill)));
	const localable = $derived(selected.filter((skill) => actions.isGlobal(skill)));

	function removeSelected() {
		if (!project) return;
		// a global skill is in every project; making it local is how it leaves
		const doomed = [...globalable];
		for (const skill of doomed) actions.setBinding(skill, project, false);
		selection.clear(doomed);
	}

	/* --------------------------------------------------------------- add */

	let adding = $state(false);

	const byId = $derived(new Map<string, Skill>(skills.map((skill) => [skill._id, skill])));

	/** A global skill is in every project already, so there is nothing to pick. */
	function alreadyGlobal(picked: { _id: string }) {
		const skill = byId.get(picked._id);
		return skill && actions.isGlobal(skill)
			? 'Global, so it is in every project already'
			: undefined;
	}

	function isIncluded(picked: Picked) {
		const skill = picked.kind === 'own' ? byId.get(picked.skill._id) : undefined;
		return !!skill && !!project && (actions.isGlobal(skill) || actions.isBound(skill, project));
	}

	function toggle(picked: Picked, included: boolean) {
		const skill = picked.kind === 'own' ? byId.get(picked.skill._id) : undefined;
		if (skill && project) actions.setBinding(skill, project, included);
	}
</script>

<svelte:head><title>{parts.path} · {APP_NAME}</title></svelte:head>

<PageActions>
	{#if project}
		<ProjectMenu {project} {skills} {actions} onRemoved={() => goto('/projects')} />
	{/if}
</PageActions>

<DetailsPage headerClass="flex items-start gap-4">
	{#snippet header()}
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
	{/snippet}

	{#if project}
		{#if bound.length === 0 && globals.length === 0}
			<div class="flex flex-col items-center justify-center gap-2 px-8 py-16 text-center">
				<p class="text-sm text-card-foreground">No skills in this project yet</p>
				<p class="text-sm text-muted-foreground">
					Add some from your library, or run
					<code class="font-mono text-foreground">skilless add &lt;skill&gt;</code> in the repo.
				</p>
				<Button size="sm" class="mt-4" onclick={() => (adding = true)}>
					<RiAddLine />
					Add
				</Button>
			</div>
		{:else}
			<ListToolbar>
				<SelectSearch
					checked={selection.all}
					indeterminate={selection.some}
					onCheckedChange={(checked) => selection.setAll(checked)}
					selectLabel="Select all shown skills"
					placeholder="Search this project"
					label="Search this project"
					class="flex-1"
					bind:value={query}
				/>

				<div class="flex shrink-0 items-center gap-2">
					<Button size="sm" onclick={() => (adding = true)}>
						<RiAddLine />
						Add
					</Button>

					<!-- only there while something is checked; grows in beside Add rather than sitting disabled -->
					{#if selected.length > 0}
						<div transition:collapseX>
							<DropdownMenu.Root>
								<DropdownMenu.Trigger>
									{#snippet child({ props })}
										<Button
											{...props}
											variant="outline"
											size="icon-sm"
											aria-label="Actions for {count(selected.length)}"
										>
											<RiMoreFill />
										</Button>
									{/snippet}
								</DropdownMenu.Trigger>

								<DropdownMenu.Content align="end">
									<DropdownMenu.Label>{count(selected.length)} selected</DropdownMenu.Label>
									<DropdownMenu.Item onSelect={() => actions.copyInstallAll(selected)}>
										<RiFileCopyLine />
										Copy install command
									</DropdownMenu.Item>

									<DropdownMenu.Separator />

									<!-- disabled rather than hidden when nothing qualifies, so the menu does not reshuffle -->
									<DropdownMenu.Group>
										<DropdownMenu.Item
											disabled={globalable.length === 0}
											onSelect={() => globalable.forEach((skill) => actions.setGlobal(skill, true))}
										>
											<RiGlobalLine />
											{only(globalable, 'Make', 'global')}
										</DropdownMenu.Item>
										<DropdownMenu.Item
											disabled={localable.length === 0}
											onSelect={() => localable.forEach((skill) => actions.setGlobal(skill, false))}
										>
											<RiGitRepositoryLine />
											{only(localable, 'Make', 'local')}
										</DropdownMenu.Item>
									</DropdownMenu.Group>

									<DropdownMenu.Separator />

									<DropdownMenu.Item
										variant="destructive"
										disabled={globalable.length === 0}
										onSelect={removeSelected}
									>
										<RiLinkUnlinkM />
										{only(globalable, 'Remove', 'from project')}
									</DropdownMenu.Item>
								</DropdownMenu.Content>
							</DropdownMenu.Root>
						</div>
					{/if}
				</div>
			</ListToolbar>

			{#if query.trim() && boundResults.length === 0 && globalResults.length === 0}
				<p class="px-6 py-16 text-center text-sm text-muted-foreground">
					No skills in this project match “{query.trim()}”.
				</p>
			{/if}

			{#if boundResults.length > 0}
				<!-- nothing above the first row to clear, so it sits closer to the search -->
				<ul class="divide-y divide-border [&>li:first-child]:pt-2">
					{#each boundResults as skill (skill._id)}
						<SkillRow
							{skill}
							{projects}
							{actions}
							terms={queryTerms}
							selected={selection.has(skill)}
							onSelectedChange={(checked) => selection.set(skill, checked)}
						/>
					{/each}
				</ul>
			{:else if !query.trim()}
				<p class="px-6 py-10 text-center text-sm text-muted-foreground">
					Only global skills here so far.
				</p>
			{/if}

			{#if globalResults.length > 0}
				<section class="mt-8 mb-8">
					<h2 class="border-b border-border pb-2 text-xs font-medium text-muted-foreground">
						Also installed here as global skills
					</h2>
					<ul class="divide-y divide-border">
						{#each globalResults as skill (skill._id)}
							<SkillRow
								{skill}
								{projects}
								{actions}
								terms={queryTerms}
								selected={selection.has(skill)}
								onSelectedChange={(checked) => selection.set(skill, checked)}
							/>
						{/each}
					</ul>
				</section>
			{/if}
		{/if}
	{/if}
</DetailsPage>

{#if project}
	<AddSkillsModal
		bind:open={adding}
		{skills}
		user={data.user}
		github={false}
		{isIncluded}
		ownDisabled={alreadyGlobal}
		onToggle={toggle}
	/>
{/if}
