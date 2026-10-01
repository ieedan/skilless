<script lang="ts">
	import { entryParts, githubEntry } from '$lib/pack';
	import type { EntryPack, EntryRepo, EntrySkill } from '$lib/pack-entries.svelte';
	import { projectParts } from '$lib/project';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { copyText } from '$lib/hooks/use-clipboard.svelte';
	import { toast } from 'svelte-sonner';
	import Avatar from './avatar.svelte';
	import GithubLogo from './github-logo.svelte';
	import ListRow from './list-row.svelte';
	import ProjectIcon from './project-icon.svelte';
	import RiDeleteBinLine from 'remixicon-svelte/icons/delete-bin-line';
	import RiExternalLinkLine from 'remixicon-svelte/icons/external-link-line';
	import RiFileCopyLine from 'remixicon-svelte/icons/file-copy-line';
	import RiGlobalLine from 'remixicon-svelte/icons/global-line';
	import RiLockLine from 'remixicon-svelte/icons/lock-line';
	import RiMoreFill from 'remixicon-svelte/icons/more-fill';
	import RiStackLine from 'remixicon-svelte/icons/stack-line';

	let {
		entry,
		skill,
		repo,
		pack = null,
		scanning = false,
		terms = [],
		selected,
		onSelectedChange,
		onRemove
	}: {
		/** As written in the pack. */
		entry: string;
		/** The skill a skilless address names, when the viewer can see it. */
		skill: EntrySkill | null;
		/** What a GitHub entry holds, once its repo has been scanned. */
		repo: EntryRepo | null;
		/** Another pack this one includes, when the viewer can see it. */
		pack?: EntryPack | null;
		/** A scan of its repo is on its way, so show where the description will be. */
		scanning?: boolean;
		/** The list's search terms, highlighted. */
		terms?: string[];
		/** Checked for bulk actions. Leave out for a row with no checkbox. */
		selected?: boolean;
		onSelectedChange?: (selected: boolean) => void;
		/** The pack's owner gets a menu to take it out. */
		onRemove?: () => void;
	} = $props();

	const parts = $derived(entryParts(entry));
	const github = $derived(githubEntry(entry));

	/** An entry pointing at exactly one skill in a repo reads as that skill. */
	const single = $derived(repo?.found && repo.skills.length === 1 ? repo.skills[0] : null);

	/** A repo entry's link; straight to the file for a skill that is nothing but its SKILL.md. */
	const repoHref = $derived.by(() => {
		if (!single?.sole || single.dir === undefined || !github) return parts.href;
		const ref = encodeURIComponent(parts.ref ?? 'HEAD');
		const dir = single.dir ? `/${single.dir}` : '';
		return `https://${github.key}/blob/${ref}${dir}/SKILL.md`;
	});

	const href = $derived(skill ? `/skills/${skill.uuid}` : pack ? `/packs/${pack.uuid}` : repoHref);

	/** Skills — on skilless, or one alone in a repo — read as code, with no picture. */
	const isSkill = $derived(skill !== null || single !== null || parts.host === 'skilless');

	const title = $derived(
		skill ? (skill.title ?? skill.name) : pack ? pack.name : single ? single.name : parts.label
	);
	const description = $derived(
		skill?.description ?? pack?.description ?? single?.description ?? repo?.description ?? null
	);

	const count = (n: number, partial = false) =>
		`${n}${partial && n > 0 ? '+' : ''} ${n === 1 && !partial ? 'skill' : 'skills'}`;

	async function copyAddress() {
		if ((await copyText(entry)) === 'success') toast.success('Copied address');
		else toast.error('Could not copy to the clipboard');
	}
</script>

{#snippet lock(tip: string)}
	<Tooltip.Root>
		<Tooltip.Trigger class="inline-flex shrink-0 text-muted-foreground">
			<RiLockLine class="size-3.5" aria-label="Private" />
		</Tooltip.Trigger>
		<Tooltip.Content>{tip}</Tooltip.Content>
	</Tooltip.Root>
{/snippet}

<ListRow
	{title}
	{href}
	mono={isSkill}
	{terms}
	{description}
	{selected}
	{onSelectedChange}
	selectLabel="Select {title}"
>
	{#snippet leading()}
		{#if pack}
			<Avatar seed={pack.owner.name} src={pack.owner.image} size={32} />
		{:else if !isSkill && github}
			<ProjectIcon parts={projectParts(github.key)} size="md" />
		{:else if !isSkill}
			<span class="flex size-8 items-center justify-center rounded-full bg-muted">
				<RiStackLine class="size-4 text-muted-foreground" aria-hidden="true" />
			</span>
		{/if}
	{/snippet}

	{#snippet meta()}
		{#if skill && !skill.public}
			{@render lock('Private, so only you can add it. Make it public for anyone else to.')}
		{:else if pack}
			{#if pack.public}
				<RiGlobalLine class="size-3.5 shrink-0 text-muted-foreground" aria-label="Public" />
			{:else}
				{@render lock('Private, so only its owner can add it.')}
			{/if}
			<span class="shrink-0 text-xs text-muted-foreground">
				{count(pack.skillCount, pack.countPartial)}
			</span>
		{:else if single && github}
			<!-- the repo it lives in, since the title is the skill -->
			<span class="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
				<GithubLogo class="size-3 shrink-0" />
				<span class="truncate">{projectParts(github.key).path}</span>
			</span>
		{:else if repo?.found}
			<span class="shrink-0 text-xs text-muted-foreground">{count(repo.skills.length)}</span>
		{/if}
		{#if parts.ref && !skill && !pack}
			<span
				class="shrink-0 rounded border border-border px-1 font-mono text-xs text-muted-foreground"
			>
				{parts.ref}
			</span>
		{/if}
	{/snippet}

	{#snippet subline()}
		{#if parts.host === 'skilless' && !skill && !pack}
			Private or deleted
		{:else if repo && !repo.found}
			Couldn't reach this repository
		{:else if !skill && !pack && !repo && scanning}
			<Skeleton class="mt-1 h-3 w-48" />
		{:else}
			No description
		{/if}
	{/snippet}

	{#snippet actions()}
		{#if onRemove}
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button {...props} variant="ghost" size="icon-sm" aria-label="Actions for {title}">
							<RiMoreFill class="text-muted-foreground" />
						</Button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end">
					{#if href}
						<DropdownMenu.Item>
							{#snippet child({ props })}
								<a
									{...props}
									{href}
									target={/^https?:/i.test(href) ? '_blank' : undefined}
									rel={/^https?:/i.test(href) ? 'noreferrer' : undefined}
								>
									<RiExternalLinkLine />
									{skill ? 'View skill' : pack ? 'View pack' : 'View repository'}
								</a>
							{/snippet}
						</DropdownMenu.Item>
					{/if}
					<DropdownMenu.Item onSelect={copyAddress}>
						<RiFileCopyLine />
						Copy address
					</DropdownMenu.Item>
					<DropdownMenu.Separator />
					<DropdownMenu.Item variant="destructive" onSelect={onRemove}>
						<RiDeleteBinLine />
						Remove from pack
					</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		{/if}
	{/snippet}
</ListRow>
