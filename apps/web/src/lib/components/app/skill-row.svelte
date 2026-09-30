<script lang="ts">
	import { around } from '$lib/search';
	import type { MenuProject, MenuSkill, SkillActions } from '$lib/skill-actions.svelte';
	import { sourceParts, type SkillSource } from '$lib/source';
	import RiGlobalLine from 'remixicon-svelte/icons/global-line';
	import RiGitRepositoryLine from 'remixicon-svelte/icons/git-repository-line';
	import GithubLogo from './github-logo.svelte';
	import GitlabLogo from './gitlab-logo.svelte';
	import Highlighted from './highlighted.svelte';
	import SkillMenu from './skill-menu.svelte';
	import { Checkbox } from '$lib/components/ui/checkbox';

	let {
		skill,
		projects,
		actions,
		terms = [],
		selected,
		onSelectedChange
	}: {
		skill: MenuSkill & { description?: string; source?: SkillSource };
		projects: MenuProject[];
		actions: SkillActions;
		/** Search terms to highlight, from the list's filter. */
		terms?: string[];
		/** Checked for bulk actions. Leave out for a row with no checkbox. */
		selected?: boolean;
		onSelectedChange?: (selected: boolean) => void;
	} = $props();

	/** A one-file skill has nothing to browse, so link straight at the file. */
	const href = $derived(
		skill.soleFile
			? `/skills/${encodeURIComponent(skill.name)}/${skill.soleFile}`
			: `/skills/${encodeURIComponent(skill.name)}`
	);

	const global = $derived(actions.isGlobal(skill));

	/** The repo it was added from, so it reads like `skilless list`. */
	const source = $derived(skill.source ? sourceParts(skill.source) : null);

	/** Counted through `isBound` so the count moves with the checkbox, not a round trip later. */
	const count = $derived(projects.filter((p) => actions.isBound(skill, p)).length);
</script>

<li class="group/row relative flex items-center justify-between gap-4 py-3.5">
	<div class="flex min-w-0 items-center gap-2.5">
		{#if selected !== undefined}
			<!--
				A cell as wide as the one select-all sits in above the list (and 1px
				in, for that field's border), so the checkboxes line up; the name then
				starts level with the search icon. Above the stretched link, like the
				repo link, so a click checks rather than opens.
			-->
			<div class="ml-px flex w-9 shrink-0 justify-center">
				<Checkbox
					checked={selected}
					onCheckedChange={(checked) => onSelectedChange?.(checked)}
					aria-label="Select {skill.name}"
					class="z-1"
				/>
			</div>
		{/if}
		<div class="flex min-w-0 flex-col gap-1.5">
			<span class="flex min-w-0 items-center gap-2">
				<a {href} class="truncate font-mono text-sm font-semibold text-card-foreground">
					<!-- stretched so the whole row is the hit target, without nesting the menu or the repo link inside it -->
					<span class="absolute inset-0" aria-hidden="true"></span>
					<Highlighted text={skill.name} {terms} />
				</a>
				{#if global}
					<span class="inline-flex shrink-0" title="Installed globally">
						<RiGlobalLine class="size-3.5 text-muted-foreground" aria-hidden="true" />
					</span>
					<span class="sr-only">Global</span>
				{:else}
					<span class="shrink-0 text-xs text-muted-foreground">
						{count}
						{count === 1 ? 'project' : 'projects'}
					</span>
				{/if}
				{#if source}
					<!-- above the stretched link, so a click here opens the repo instead of the skill -->
					<svelte:element
						this={source.href ? 'a' : 'span'}
						href={source.href}
						target={source.href ? '_blank' : undefined}
						rel={source.href ? 'noreferrer' : undefined}
						class={[
							'relative inline-flex min-w-0 items-center gap-1 text-xs text-muted-foreground',
							source.href && 'hover:text-foreground'
						]}
						title="Added from {source.path}"
					>
						{#if source.host === 'github'}
							<GithubLogo class="size-3 shrink-0" />
						{:else if source.host === 'gitlab'}
							<GitlabLogo class="size-3 shrink-0" />
						{:else}
							<RiGitRepositoryLine class="size-3 shrink-0" aria-hidden="true" />
						{/if}
						<span class="truncate">{source.path}</span>
					</svelte:element>
				{/if}
			</span>
			<!-- one line at a reading width; the skill's page has the rest -->
			<span class="max-w-2xl truncate text-[13px] text-muted-foreground">
				{#if skill.description}
					<Highlighted text={around(skill.description, terms)} {terms} />
				{:else}
					No description
				{/if}
			</span>
		</div>
	</div>

	<div class="relative flex shrink-0 items-center gap-3">
		<SkillMenu {skill} {projects} {actions} />
	</div>
</li>
