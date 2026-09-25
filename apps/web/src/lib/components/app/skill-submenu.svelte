<script lang="ts" generics="Skill extends { _id: string; name: string; description?: string }">
	import * as Drawer from '$lib/components/ui/drawer';
	import RiArrowRightSLine from 'remixicon-svelte/icons/arrow-right-s-line';
	import RiCodeSSlashLine from 'remixicon-svelte/icons/code-s-slash-line';
	import RiGlobalLine from 'remixicon-svelte/icons/global-line';
	import CheckRow from './check-row.svelte';
	import FilterInput from './filter-input.svelte';

	let {
		skills,
		isGlobal,
		isBound,
		onToggle
	}: {
		skills: Skill[];
		/** A global skill is in every project already, so it shows as included and locked. */
		isGlobal: (skill: Skill) => boolean;
		isBound: (skill: Skill) => boolean;
		onToggle: (skill: Skill, bound: boolean) => void;
	} = $props();

	let query = $state('');
	let input = $state<HTMLInputElement | null>(null);

	const needle = $derived(query.trim().toLowerCase());

	/** Globals last: they cannot be toggled here, so they should not sit between the ones that can. */
	const filtered = $derived.by(() => {
		const list = needle
			? skills.filter(
					(skill) =>
						skill.name.toLowerCase().includes(needle) ||
						skill.description?.toLowerCase().includes(needle)
				)
			: skills;
		return [...list.filter((s) => !isGlobal(s)), ...list.filter((s) => isGlobal(s))];
	});

	const count = $derived(skills.filter((skill) => isGlobal(skill) || isBound(skill)).length);
</script>

<Drawer.Root onOpenChange={(open) => !open && (query = '')}>
	<Drawer.Trigger class={Drawer.drawerItemClass}>
		<RiCodeSSlashLine />
		<span class="flex-1">Skills</span>
		<span class="text-xs text-muted-foreground tabular-nums">{count}</span>
		<RiArrowRightSLine />
	</Drawer.Trigger>

	<Drawer.Content
		onOpenAutoFocus={(event) => {
			// on touch screens this would throw up the keyboard over the list
			if (!matchMedia('(pointer: fine)').matches) return;
			event.preventDefault();
			input?.focus();
		}}
	>
		<Drawer.Header>
			<Drawer.Title>Skills</Drawer.Title>
			<Drawer.Description>What this project gets.</Drawer.Description>
		</Drawer.Header>

		<FilterInput bind:ref={input} bind:value={query} aria-label="Filter skills" />

		<div class="flex flex-col">
			{#each filtered as skill (skill._id)}
				{@const global = isGlobal(skill)}
				<CheckRow
					checked={global || isBound(skill)}
					disabled={global}
					onCheckedChange={(bound) => onToggle(skill, bound)}
					align="start"
				>
					<span class="flex min-w-0 flex-col gap-0.5 {global ? 'opacity-60' : ''}">
						<span class="flex min-w-0 items-center gap-1.5">
							<span class="truncate font-mono text-[13px] font-semibold">{skill.name}</span>
							{#if global}
								<RiGlobalLine class="size-3.5 text-muted-foreground" aria-label="Global" />
							{/if}
						</span>
						<span class="line-clamp-1 text-xs text-muted-foreground">
							{skill.description || 'No description'}
						</span>
					</span>
				</CheckRow>
			{:else}
				<p class="px-2 py-1.5 text-xs text-muted-foreground">
					{skills.length === 0 ? 'No skills yet.' : 'No skills match.'}
				</p>
			{/each}
		</div>
	</Drawer.Content>
</Drawer.Root>
