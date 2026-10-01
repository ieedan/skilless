<script lang="ts">
	import * as Drawer from '$lib/components/ui/drawer';
	import { Button } from '$lib/components/ui/button';
	import { projectParts } from '$lib/project';
	import type { MenuProject, MenuSkill, SkillActions } from '$lib/skill-actions.svelte';
	import RiMoreFill from 'remixicon-svelte/icons/more-fill';
	import RiDeleteBinLine from 'remixicon-svelte/icons/delete-bin-line';
	import RiExternalLinkLine from 'remixicon-svelte/icons/external-link-line';
	import SkillSubdrawer from './skill-subdrawer.svelte';

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

	let open = $state(false);

	const parts = $derived(projectParts(project.key));
	const path = $derived(parts.path);
</script>

<Drawer.Root bind:open>
	<Drawer.Trigger>
		{#snippet child({ props })}
			<Button {...props} variant="ghost" size="icon-sm" aria-label="Actions for {path}">
				<RiMoreFill class="text-muted-foreground" />
			</Button>
		{/snippet}
	</Drawer.Trigger>

	<Drawer.Content>
		<Drawer.Header>
			<Drawer.Title class="truncate">{path}</Drawer.Title>
			<Drawer.Description class="sr-only">Actions for this project</Drawer.Description>
		</Drawer.Header>

		{#if parts.host !== 'other'}
			<Drawer.Item
				href="https://{project.key}"
				target="_blank"
				rel="noreferrer"
				onclick={() => (open = false)}
			>
				<RiExternalLinkLine />
				Open repository
			</Drawer.Item>
		{/if}

		<SkillSubdrawer
			{skills}
			isGlobal={(skill) => actions.isGlobal(skill)}
			isBound={(skill) => actions.isBound(skill, project)}
			onToggle={(skill, bound) => actions.setBinding(skill, project, bound)}
		/>

		<!-- nothing to uninstall until a skill makes it a project -->
		{#if !project.unsaved}
			<Drawer.Separator />

			<Drawer.Item
				variant="destructive"
				onclick={() => {
					// close first so the drawer is out of the way of the dialog
					open = false;
					onUninstall();
				}}
			>
				<RiDeleteBinLine />
				Uninstall
			</Drawer.Item>
		{/if}
	</Drawer.Content>
</Drawer.Root>
