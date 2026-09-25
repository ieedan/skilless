<script lang="ts" module>
	import { IsMobile } from '$lib/hooks/is-mobile.svelte';

	// one listener shared by every row's menu
	const mobile = new IsMobile();
</script>

<script lang="ts">
	import { confirmDelete } from '$lib/components/ui/confirm-delete-dialog';
	import { projectParts } from '$lib/project';
	import type { MenuProject, MenuSkill, SkillActions } from '$lib/skill-actions.svelte';
	import { submitAction } from '$lib/submit';
	import ProjectMenuDrawer from './project-menu-drawer.svelte';
	import ProjectMenuDropdown from './project-menu-dropdown.svelte';

	/** A dropdown on desktop, a stack of drawers on phones. */
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

	function uninstall() {
		const { path } = projectParts(project.key);
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

{#if mobile.current}
	<ProjectMenuDrawer {project} {skills} {actions} {onBind} onUninstall={uninstall} />
{:else}
	<ProjectMenuDropdown {project} {skills} {actions} {onBind} onUninstall={uninstall} />
{/if}
