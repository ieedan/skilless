<script lang="ts">
	import { around, highlight } from '$lib/search';
	import type { MenuProject, MenuSkill, SkillActions } from '$lib/skill-actions.svelte';
	import RiGlobalLine from 'remixicon-svelte/icons/global-line';
	import SkillMenu from './skill-menu.svelte';

	let {
		skill,
		projects,
		actions,
		terms = []
	}: {
		skill: MenuSkill & { description?: string };
		projects: MenuProject[];
		actions: SkillActions;
		/** Search terms to highlight, from the list's filter. */
		terms?: string[];
	} = $props();

	/** A one-file skill has nothing to browse, so link straight at the file. */
	const href = $derived(
		skill.soleFile
			? `/skills/${encodeURIComponent(skill.name)}/${skill.soleFile}`
			: `/skills/${encodeURIComponent(skill.name)}`
	);

	const global = $derived(actions.isGlobal(skill));

	/** Counted through `isBound` so the count moves with the checkbox, not a round trip later. */
	const count = $derived(projects.filter((p) => actions.isBound(skill, p)).length);
</script>

{#snippet marked(text: string)}
	<!-- one line: whitespace between segments would render as stray spaces -->
	{#each highlight(text, terms) as segment, i (i)}{#if segment.match}<mark
				class="bg-primary/20 text-foreground">{segment.text}</mark
			>{:else}{segment.text}{/if}{/each}
{/snippet}

<li class="group/row relative flex items-center justify-between gap-4 py-3.5">
	<a {href} class="flex min-w-0 flex-col gap-1.5">
		<!-- stretched so the whole row is the hit target, without nesting the menu inside the link -->
		<span class="absolute inset-0" aria-hidden="true"></span>
		<span class="flex min-w-0 items-center gap-2">
			<span class="truncate font-mono text-sm font-semibold text-card-foreground">
				{@render marked(skill.name)}
			</span>
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
		</span>
		<!--
			Two lines rather than one: descriptions come from SKILL.md
			frontmatter and are often a full sentence, which a single
			truncated line cuts to almost nothing at this width.
		-->
		<span class="line-clamp-2 text-[13px] text-muted-foreground">
			{#if skill.description}
				{@render marked(around(skill.description, terms))}
			{:else}
				No description
			{/if}
		</span>
	</a>

	<div class="relative flex shrink-0 items-center gap-3">
		<SkillMenu {skill} {projects} {actions} />
	</div>
</li>
