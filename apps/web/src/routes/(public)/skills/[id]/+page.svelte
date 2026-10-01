<script lang="ts">
	import { APP_NAME } from '$lib/constants';
	import { skillBadges } from '$lib/skill';
	import BinaryFile from '$lib/components/app/binary-file.svelte';
	import CodeEditor from '$lib/components/app/code-editor.svelte';
	import FileIcon from '$lib/components/app/file-icon.svelte';
	import Owner from '$lib/components/app/owner.svelte';
	import Snippet from '$lib/components/app/snippet.svelte';
	import { badgeVariants } from '$lib/components/ui/badge';
	import RiLockLine from 'remixicon-svelte/icons/lock-line';

	let { data } = $props();

	const badges = $derived(skillBadges(data.skill.metadata));

	/** SKILL.md first (see +page.server.ts), so it is what opens. */
	let selected = $state<string | null>(null);
	const file = $derived(data.files.find((f) => f.path === selected) ?? data.files[0]);
</script>

<svelte:head>
	<title>{data.skill.title ?? data.skill.name} · {APP_NAME}</title>
	{#if data.skill.description}<meta name="description" content={data.skill.description} />{/if}
</svelte:head>

<header class="flex flex-col gap-4 pt-10 pb-6">
	<div class="flex flex-col gap-2">
		<h1 class="font-mono text-2xl font-semibold text-foreground">
			{data.skill.title ?? data.skill.name}
		</h1>
		{#if data.skill.description}
			<p class="text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
				{data.skill.description}
			</p>
		{/if}
	</div>

	<div class="flex flex-wrap items-center gap-3">
		<Owner owner={data.owner} />
		{#if !data.skill.public}
			<!-- only its owner ever sees a private one -->
			<span class={badgeVariants({ variant: 'outline' })}>
				<RiLockLine aria-hidden="true" />
				Private, only you can see this
			</span>
		{/if}
		{#if badges.version}
			<span class={badgeVariants({ variant: 'outline' })}>v{badges.version}</span>
		{/if}
		{#if badges.license}
			<span class={badgeVariants({ variant: 'outline' })}>{badges.license}</span>
		{/if}
	</div>

	<Snippet command="skilless add {data.address}" class="w-full max-w-full" />
</header>

<section class="overflow-hidden rounded-lg border border-border">
	{#if data.files.length > 1}
		<!-- one row of tabs; a skill rarely has more than a handful of files -->
		<div class="flex gap-1 overflow-x-auto border-b border-border bg-card p-1" role="tablist">
			{#each data.files as f (f.path)}
				<button
					type="button"
					role="tab"
					aria-selected={f.path === file?.path}
					class={[
						'flex shrink-0 items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px]',
						f.path === file?.path
							? 'bg-accent text-accent-foreground'
							: 'text-muted-foreground hover:text-foreground'
					]}
					onclick={() => (selected = f.path)}
				>
					<FileIcon path={f.path} />
					{f.path}
				</button>
			{/each}
		</div>
	{/if}

	{#if file}
		{#key file.path}
			{#if file.binary}
				<BinaryFile path={file.path} url={file.binary.url} size={file.binary.size} />
			{:else}
				<CodeEditor value={file.contents} path={file.path} readonly />
			{/if}
		{/key}
	{/if}
</section>
