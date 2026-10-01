<script lang="ts">
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Button } from '$lib/components/ui/button';
	import { projectParts } from '$lib/project';
	import type { MenuProject, MenuSkill, SkillActions } from '$lib/skill-actions.svelte';
	import RiMoreFill from 'remixicon-svelte/icons/more-fill';
	import RiDeleteBinLine from 'remixicon-svelte/icons/delete-bin-line';
	import RiExternalLinkLine from 'remixicon-svelte/icons/external-link-line';
	import SkillSubmenu from './skill-submenu.svelte';

	let {
		project,
		skills,
		actions,
		onUninstall
	}: {
		project: MenuProject;
		skills: (MenuSkill & { description?: string })[];
		actions: SkillActions;
		onUninstall: () => void;
	} = $props();

	const parts = $derived(projectParts(project.key));
	const path = $derived(parts.path);
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Button {...props} variant="ghost" size="icon-sm" aria-label="Actions for {path}">
				<RiMoreFill class="text-muted-foreground" />
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>

	<DropdownMenu.Content align="end">
		{#if parts.host !== 'other'}
			<DropdownMenu.Item>
				{#snippet child({ props })}
					<a {...props} href="https://{project.key}" target="_blank" rel="noreferrer">
						<RiExternalLinkLine />
						Open repository
					</a>
				{/snippet}
			</DropdownMenu.Item>
		{/if}
		<SkillSubmenu
			{skills}
			isGlobal={(skill) => actions.isGlobal(skill)}
			isBound={(skill) => actions.isBound(skill, project)}
			onToggle={(skill, bound) => actions.setBinding(skill, project, bound)}
		/>

		<!-- nothing to uninstall until a skill makes it a project -->
		{#if !project.unsaved}
			<DropdownMenu.Separator />

			<DropdownMenu.Item variant="destructive" onSelect={onUninstall}>
				<RiDeleteBinLine />
				Uninstall
			</DropdownMenu.Item>
		{/if}
	</DropdownMenu.Content>
</DropdownMenu.Root>
