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
	import RiLink from 'remixicon-svelte/icons/link';
	import RiLockLine from 'remixicon-svelte/icons/lock-line';
	import RiShareLine from 'remixicon-svelte/icons/share-line';
	import RiRefreshLine from 'remixicon-svelte/icons/refresh-line';
	import { imports } from '$lib/imports.svelte';
	import RiGlobalLine from 'remixicon-svelte/icons/global-line';
	import RiGitRepositoryLine from 'remixicon-svelte/icons/git-repository-line';

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

	const base = $derived(`/my-skills/${encodeURIComponent(skill.name)}`);
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
				downloadZip(`/my-skills.zip?name=${encodeURIComponent(skill.name)}`, skill.name)
			)}
		>
			<RiDownload2Line />
			Download
		</Drawer.Item>
		{#if actions.canUpdate(skill)}
			<Drawer.Item
				disabled={imports.isUpdating(skill.name)}
				onclick={run(() => actions.updateFromSource(skill))}
			>
				<RiRefreshLine />
				Update from source
			</Drawer.Item>
		{/if}

		<Drawer.Separator />

		<Drawer.Item onclick={run(() => actions.copyLink(skill))}>
			<RiLink />
			Copy link
		</Drawer.Item>
		{#if actions.isPublic(skill)}
			<Drawer.Item onclick={run(() => actions.setPublic(skill, false))}>
				<RiLockLine />
				Make private
			</Drawer.Item>
		{:else}
			<Drawer.Item onclick={run(() => actions.setPublic(skill, true))}>
				<RiShareLine />
				Make public
			</Drawer.Item>
		{/if}

		<Drawer.Separator />

		<!-- global: in every project, bound or not; local: only the projects it is added to -->
		{#if actions.isGlobal(skill)}
			<Drawer.Item onclick={run(() => actions.setGlobal(skill, false))}>
				<RiGitRepositoryLine />
				Make local
			</Drawer.Item>
		{:else}
			<Drawer.Item onclick={run(() => actions.setGlobal(skill, true))}>
				<RiGlobalLine />
				Make global
			</Drawer.Item>
		{/if}

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
