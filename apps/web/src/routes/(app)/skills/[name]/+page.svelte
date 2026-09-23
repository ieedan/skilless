<script lang="ts">
	import { APP_NAME } from '$lib/constants';
	import { goto } from '$app/navigation';
	import { listDirectory } from '$lib/files';
	import { skillBadges } from '$lib/skill';
	import { SkillActions } from '$lib/skill-actions.svelte';
	import PageActions from '$lib/components/app/page-actions.svelte';
	import SkillMenu from '$lib/components/app/skill-menu.svelte';
	import EntryList from '$lib/components/app/entry-list.svelte';
	import ReadingColumn from '$lib/components/app/reading-column.svelte';
	import type { Icon } from '$lib/components/app/file-icon.svelte';
	import { badgeVariants } from '$lib/components/ui/badge';
	import RiRobot2Line from 'remixicon-svelte/icons/robot-2-line';
	import RiScales3Line from 'remixicon-svelte/icons/scales-3-line';
	import RiToolsLine from 'remixicon-svelte/icons/tools-line';
	import * as Tooltip from '$lib/components/ui/tooltip';

	let { data } = $props();

	// Live (see +page.server.ts), and null for a moment if the skill is deleted
	// from elsewhere. Optional chained because the header menu outlives this page
	// (see PageActions): navigating away hands it the next page's data first.
	const skill = $derived(data.skill?.data);
	const projects = $derived(data.projects?.data ?? []);

	const badges = $derived(skillBadges(skill?.metadata));
	const entries = $derived(skill ? listDirectory(skill.files) : []);

	/** The menu wants the same shape the skills list has. */
	const menuSkill = $derived(
		skill && { ...skill, projectIds: skill.projects.map((project) => project._id) }
	);

	const actions = new SkillActions();

	/**
	 * Some descriptions run to a paragraph, since agents read them to decide
	 * when to use a skill. Clamped to two lines, with the toggle only when the
	 * clamp actually hides something.
	 */
	let expanded = $state(false);
	let overflowing = $state(false);
	let descriptionEl = $state<HTMLParagraphElement | null>(null);

	// A different skill starts clamped again. Keyed on the id, not `skill`: the
	// live query hands over a new object on every change, even a project toggle.
	const skillId = $derived(skill?._id);
	$effect.pre(() => {
		void skillId;
		expanded = false;
	});

	// re-measured on resize, since a narrower column wraps into more lines
	$effect(() => {
		const el = descriptionEl;
		if (!el || expanded) return;

		const measure = () => (overflowing = el.scrollHeight > el.clientHeight + 1);
		const observer = new ResizeObserver(measure);
		observer.observe(el);
		measure();
		return () => observer.disconnect();
	});

	const tools = $derived(badges.allowedTools.length);
</script>

<svelte:head><title>{skill?.name} · {APP_NAME}</title></svelte:head>

<PageActions>
	{#if menuSkill}
		<SkillMenu
			skill={menuSkill}
			{projects}
			{actions}
			browse={false}
			onRemoved={() => goto('/skills')}
		/>
	{/if}
</PageActions>

<!-- a badge with a tooltip; a button underneath so keyboard users can reach the tooltip too -->
{#snippet badge(label: string, tip: string, Icon?: Icon)}
	<Tooltip.Root>
		<Tooltip.Trigger class={badgeVariants({ variant: 'outline' })}>
			{#if Icon}<Icon aria-hidden="true" />{/if}
			{label}
		</Tooltip.Trigger>
		<Tooltip.Content>{tip}</Tooltip.Content>
	</Tooltip.Root>
{/snippet}

<ReadingColumn>
	<!-- the same inset as the file rows below, so the text lines up with the file names -->
	<header class="flex flex-col gap-3 border-b border-border px-2 pt-6 pb-5 md:px-6 md:pt-8 md:pb-6">
		<!-- the name as the author wrote it, which can differ from the one it is stored under -->
		<h1 class="truncate font-mono text-xl font-semibold text-card-foreground">
			{skill?.title ?? skill?.name}
		</h1>

		{#if skill?.description}
			<div class="flex flex-col items-start gap-1">
				<p
					bind:this={descriptionEl}
					id="skill-description"
					class={[
						'text-sm leading-relaxed whitespace-pre-line text-muted-foreground',
						!expanded && 'line-clamp-2'
					]}
				>
					{skill.description}
				</p>
				{#if overflowing || expanded}
					<button
						type="button"
						class="text-[13px] text-foreground underline-offset-4 hover:underline"
						aria-expanded={expanded}
						aria-controls="skill-description"
						onclick={() => (expanded = !expanded)}
					>
						{expanded ? 'Hide' : 'Show more'}
					</button>
				{/if}
			</div>
		{/if}

		{#if badges.modelInvocable || badges.version || badges.license || tools > 0}
			<div class="flex flex-wrap items-center gap-1.5">
				{#if badges.modelInvocable}
					{@render badge('Model Invocable', 'Agents can use this on their own', RiRobot2Line)}
				{/if}
				{#if badges.version}
					{@render badge(`v${badges.version}`, 'Version')}
				{/if}
				{#if badges.license}
					{@render badge(badges.license, 'License', RiScales3Line)}
				{/if}
				{#if tools > 0}
					{@render badge(
						tools === 1 ? '1 tool' : `${tools} tools`,
						`Allowed tools: ${badges.allowedTools.join(', ')}`,
						RiToolsLine
					)}
				{/if}
			</div>
		{/if}
	</header>

	<EntryList {entries} contents={data.contents} base="/skills/{skill?.name}" />
</ReadingColumn>
