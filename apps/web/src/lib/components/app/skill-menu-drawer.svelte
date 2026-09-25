<script lang="ts">
	import * as Drawer from '$lib/components/ui/drawer';
	import { Button } from '$lib/components/ui/button';
	import ProjectSubdrawer from './project-subdrawer.svelte';
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

	let open = $state(false);

	const base = $derived(`/skills/${encodeURIComponent(skill.name)}`);
	const main = $derived(skill.soleFile ?? 'SKILL.md');

	/** Close first so the drawer is out of the way of whatever the action opens. */
	function run(action: () => unknown) {
		return () => {
			open = false;
			action();
		};
	}
</script>

<Drawer.Root bind:open>
	<Drawer.Trigger>
		{#snippet child({ props })}
			<Button {...props} variant="ghost" size="icon-sm" aria-label="Actions for {skill.name}">
				<RiMoreFill class="text-muted-foreground" />
			</Button>
		{/snippet}
	</Drawer.Trigger>

	<Drawer.Content>
		<Drawer.Header>
			<Drawer.Title class="font-mono">{skill.name}</Drawer.Title>
			<Drawer.Description class="sr-only">Actions for this skill</Drawer.Description>
		</Drawer.Header>

		<Drawer.Item href="{base}/{main}" onclick={() => (open = false)}>
			<RiPencilLine />
			Edit {main}
		</Drawer.Item>
		{#if browse}
			<Drawer.Item href={base} onclick={() => (open = false)}>
				<RiFolderOpenLine />
				Browse files
			</Drawer.Item>
		{/if}
		<Drawer.Item onclick={run(() => actions.copyInstall(skill))}>
			<RiFileCopyLine />
			Copy install command
		</Drawer.Item>
		<Drawer.Item
			onclick={run(() =>
				downloadZip(`/skills.zip?name=${encodeURIComponent(skill.name)}`, skill.name)
			)}
		>
			<RiDownload2Line />
			Download
		</Drawer.Item>

		<Drawer.Separator />

		<ProjectSubdrawer
			{projects}
			global={actions.isGlobal(skill)}
			onGlobalChange={(global) => actions.setGlobal(skill, global)}
			isBound={(project) => actions.isBound(skill, project)}
			onToggle={(project, bound) => actions.setBinding(skill, project, bound)}
		/>

		<Drawer.Separator />

		<Drawer.Item variant="destructive" onclick={run(() => actions.remove(skill, onRemoved))}>
			<RiDeleteBinLine />
			Delete
		</Drawer.Item>
	</Drawer.Content>
</Drawer.Root>
