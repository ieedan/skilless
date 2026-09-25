<script lang="ts">
	import * as Drawer from '$lib/components/ui/drawer';
	import { Button } from '$lib/components/ui/button';
	import { confirmDelete } from '$lib/components/ui/confirm-delete-dialog';
	import { projectParts } from '$lib/project';
	import type { MenuProject, MenuSkill, SkillActions } from '$lib/skill-actions.svelte';
	import { submitAction } from '$lib/submit';
	import RiMoreFill from 'remixicon-svelte/icons/more-fill';
	import RiDeleteBinLine from 'remixicon-svelte/icons/delete-bin-line';
	import SkillSubmenu from './skill-submenu.svelte';

	let {
		project,
		skills,
		actions,
		onRemoved,
		onBind
	}: {
		project: MenuProject;
		skills: (MenuSkill & { description?: string })[];
		actions: SkillActions;
		onRemoved?: () => Promise<unknown>;
		/** Before a skill is toggled from the Skills submenu. */
		onBind?: () => void;
	} = $props();

	let open = $state(false);

	const path = $derived(projectParts(project.key).path);

	function uninstall() {
		// close first so the drawer is out of the way of the dialog
		open = false;
		confirmDelete({
			title: `Uninstall ${path}?`,
			description: 'Every skill is removed from this project. The skills stay in your library.',
			confirm: { text: 'Uninstall' },
			onConfirm: async () => {
				// fed by live queries, so there is nothing to invalidate
				const result = await submitAction(
					'/projects?/remove',
					{ projectId: project._id },
					{ invalidate: false }
				);
				if (result.type === 'success') await onRemoved?.();
			}
		});
	}
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

		<SkillSubmenu
			{skills}
			isGlobal={(skill) => actions.isGlobal(skill)}
			isBound={(skill) => actions.isBound(skill, project)}
			onToggle={(skill, bound) => {
				onBind?.();
				actions.setBinding(skill, project, bound);
			}}
		/>

		<!-- nothing to uninstall until a skill makes it a project -->
		{#if !project.unsaved}
			<Drawer.Separator />

			<Drawer.Item variant="destructive" onclick={uninstall}>
				<RiDeleteBinLine />
				Uninstall
			</Drawer.Item>
		{/if}
	</Drawer.Content>
</Drawer.Root>
