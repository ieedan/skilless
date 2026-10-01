<script lang="ts">
	import type { MenuProject, MenuSkill, SkillActions } from '$lib/skill-actions.svelte';
	import type { SkillSource } from '$lib/source';
	import RiGlobalLine from 'remixicon-svelte/icons/global-line';
	import RiShareLine from 'remixicon-svelte/icons/share-line';
	import SkillOrigin from './skill-origin.svelte';
	import ListRow from './list-row.svelte';
	import SkillMenu from './skill-menu.svelte';

	let {
		skill,
		projects,
		actions: skillActions,
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
			? `/my-skills/${encodeURIComponent(skill.name)}/${skill.soleFile}`
			: `/my-skills/${encodeURIComponent(skill.name)}`
	);

	const global = $derived(skillActions.isGlobal(skill));

	/** Counted through `isBound` so the count moves with the checkbox, not a round trip later. */
	const count = $derived(projects.filter((p) => skillActions.isBound(skill, p)).length);
</script>

<ListRow
	title={skill.name}
	{href}
	mono
	{terms}
	description={skill.description}
	{selected}
	{onSelectedChange}
>
	{#snippet meta()}
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
		{#if skill.source}
			<SkillOrigin source={skill.source} soleFile={skill.soleFile} />
		{/if}
		{#if skillActions.isPublic(skill)}
			<span class="inline-flex shrink-0" title="Public: anyone with the link can see it">
				<RiShareLine class="size-3.5 text-muted-foreground" aria-hidden="true" />
			</span>
			<span class="sr-only">Public</span>
		{/if}
	{/snippet}

	{#snippet actions()}
		<SkillMenu {skill} {projects} actions={skillActions} />
	{/snippet}
</ListRow>
