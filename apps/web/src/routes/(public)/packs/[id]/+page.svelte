<script lang="ts">
	import { APP_NAME } from '$lib/constants';
	import Owner from '$lib/components/app/owner.svelte';
	import PackEntry from '$lib/components/app/pack-entry.svelte';
	import Snippet from '$lib/components/app/snippet.svelte';
	import { Button } from '$lib/components/ui/button';
	import { badgeVariants } from '$lib/components/ui/badge';
	import RiLockLine from 'remixicon-svelte/icons/lock-line';
	import RiPencilLine from 'remixicon-svelte/icons/pencil-line';

	let { data } = $props();
</script>

<svelte:head>
	<title>{data.pack.name} · {APP_NAME}</title>
	{#if data.pack.description}<meta name="description" content={data.pack.description} />{/if}
</svelte:head>

<header class="flex flex-col gap-4 pt-10 pb-6">
	<div class="flex items-start justify-between gap-4">
		<div class="flex min-w-0 flex-col gap-2">
			<h1 class="text-2xl font-semibold text-foreground">{data.pack.name}</h1>
			{#if data.pack.description}
				<p class="text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
					{data.pack.description}
				</p>
			{/if}
		</div>
		{#if data.mine}
			<Button href="/my-packs/{data.pack.uuid}" variant="outline" size="sm">
				<RiPencilLine />
				Edit
			</Button>
		{/if}
	</div>

	<div class="flex flex-wrap items-center gap-3">
		<Owner owner={data.owner} />
		<span class="text-sm text-muted-foreground">
			{data.pack.count}
		</span>
		{#if !data.pack.public}
			<span class={badgeVariants({ variant: 'outline' })}>
				<RiLockLine aria-hidden="true" />
				Private, only you can see this
			</span>
		{/if}
	</div>

	<Snippet command="skilless add {data.address}" class="w-full max-w-full" />
</header>

{#if data.entries.length === 0}
	<p class="py-16 text-center text-sm text-muted-foreground">This pack is empty.</p>
{:else}
	<ul class="divide-y divide-border border-t border-border">
		{#each data.entries as { entry, skill, repo, pack } (entry)}
			<PackEntry {entry} {skill} {repo} {pack} />
		{/each}
	</ul>
{/if}
