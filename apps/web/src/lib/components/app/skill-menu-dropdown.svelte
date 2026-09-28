<script lang="ts">
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Button } from '$lib/components/ui/button';
	import ProjectSubmenu from './project-submenu.svelte';
	import { downloadZip } from '$lib/download';
	import type { MenuProject, MenuSkill, SkillActions } from '$lib/skill-actions.svelte';
	import RiMoreFill from 'remixicon-svelte/icons/more-fill';
	import RiPencilLine from 'remixicon-svelte/icons/pencil-line';
	import RiFolderOpenLine from 'remixicon-svelte/icons/folder-open-line';
	import RiFileCopyLine from 'remixicon-svelte/icons/file-copy-line';
	import RiDownload2Line from 'remixicon-svelte/icons/download-2-line';
	import RiDeleteBinLine from 'remixicon-svelte/icons/delete-bin-line';

	let {
		skill,
		projects,
		actions,
		browse = true,
		onRemoved
	}: {
		skill: MenuSkill;
		projects: MenuProject[];
		actions: SkillActions;
		/** Off on the skill's own page, where "Browse files" would link to itself. */
		browse?: boolean;
		onRemoved?: () => Promise<unknown>;
	} = $props();

	const base = $derived(`/skills/${encodeURIComponent(skill.name)}`);
	const main = $derived(skill.soleFile ?? 'SKILL.md');
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Button {...props} variant="ghost" size="icon-sm" aria-label="Actions for {skill.name}">
				<RiMoreFill class="text-muted-foreground" />
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>

	<DropdownMenu.Content align="end">
		<DropdownMenu.Item>
			{#snippet child({ props })}
				<a {...props} href="{base}/{main}">
					<RiPencilLine />
					Edit {main}
				</a>
			{/snippet}
		</DropdownMenu.Item>
		{#if browse}
			<DropdownMenu.Item>
				{#snippet child({ props })}
					<a {...props} href={base}>
						<RiFolderOpenLine />
						Browse files
					</a>
				{/snippet}
			</DropdownMenu.Item>
		{/if}
		<DropdownMenu.Item onSelect={() => actions.copyInstall(skill)}>
			<RiFileCopyLine />
			Copy install command
		</DropdownMenu.Item>
		<DropdownMenu.Item
			onSelect={() => downloadZip(`/skills.zip?name=${encodeURIComponent(skill.name)}`, skill.name)}
		>
			<RiDownload2Line />
			Download
		</DropdownMenu.Item>

		<DropdownMenu.Separator />

		<ProjectSubmenu
			{projects}
			global={actions.isGlobal(skill)}
			onGlobalChange={(global) => actions.setGlobal(skill, global)}
			isBound={(project) => actions.isBound(skill, project)}
			onToggle={(project, bound) => actions.setBinding(skill, project, bound)}
		/>

		<DropdownMenu.Separator />

		<DropdownMenu.Item variant="destructive" onSelect={() => actions.remove(skill, onRemoved)}>
			<RiDeleteBinLine />
			Delete
		</DropdownMenu.Item>
	</DropdownMenu.Content>
</DropdownMenu.Root>
