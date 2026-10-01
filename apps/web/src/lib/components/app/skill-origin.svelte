<script lang="ts">
	import { fileHref } from '$lib/pack';
	import { originOf, type SkillSource } from '$lib/source';
	import { badgeVariants } from '$lib/components/ui/badge';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import GithubLogo from './github-logo.svelte';
	import GitlabLogo from './gitlab-logo.svelte';
	import RiCodeSSlashLine from 'remixicon-svelte/icons/code-s-slash-line';
	import RiGitRepositoryLine from 'remixicon-svelte/icons/git-repository-line';
	import RiStackLine from 'remixicon-svelte/icons/stack-line';

	let {
		source,
		soleFile,
		badge = false
	}: {
		source: SkillSource;
		/** The skill's one file, when it has just one: a repo link then goes to it, not its folder. */
		soleFile?: string;
		/** A badge with a tooltip, as on the skill's page; otherwise gray text, as in the list. */
		badge?: boolean;
	} = $props();

	const origin = $derived(originOf(source));

	const label = $derived(origin?.kind === 'repo' ? origin.path : origin?.label);
	const href = $derived(
		origin?.kind === 'repo' && origin.href && soleFile && origin.host !== 'other'
			? fileHref(origin.href, soleFile)
			: origin?.href
	);
	/** Off-site links open in a new tab; a pack or skill here opens in place. */
	const external = $derived(href !== undefined && /^https?:/i.test(href));

	const tip = $derived(
		origin?.kind === 'pack'
			? 'Added by this pack. Updates come from where the pack points.'
			: origin?.kind === 'skill'
				? 'Added from this skill on skilless'
				: 'Added from this repository'
	);
</script>

{#snippet icon()}
	{#if origin?.kind === 'pack'}
		<RiStackLine class={badge ? '' : 'size-3 shrink-0'} aria-hidden="true" />
	{:else if origin?.kind === 'skill'}
		<RiCodeSSlashLine class={badge ? '' : 'size-3 shrink-0'} aria-hidden="true" />
	{:else if origin?.host === 'github'}
		<GithubLogo class={badge ? '' : 'size-3 shrink-0'} />
	{:else if origin?.host === 'gitlab'}
		<GitlabLogo class={badge ? '' : 'size-3 shrink-0'} />
	{:else}
		<RiGitRepositoryLine class={badge ? '' : 'size-3 shrink-0'} aria-hidden="true" />
	{/if}
{/snippet}

{#if origin}
	{#if badge}
		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<svelte:element
						this={href ? 'a' : 'button'}
						{...props}
						{href}
						target={external ? '_blank' : undefined}
						rel={external ? 'noreferrer' : undefined}
						type={href ? undefined : 'button'}
						class={badgeVariants({ variant: 'outline' })}
					>
						{@render icon()}
						{label}
					</svelte:element>
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content>{tip}</Tooltip.Content>
		</Tooltip.Root>
	{:else}
		<!-- above the row's stretched link, so a click here opens the origin instead of the skill -->
		<svelte:element
			this={href ? 'a' : 'span'}
			{href}
			target={external ? '_blank' : undefined}
			rel={external ? 'noreferrer' : undefined}
			class={[
				'relative inline-flex min-w-0 items-center gap-1 text-xs text-muted-foreground',
				href && 'hover:text-foreground'
			]}
			title={tip}
		>
			{@render icon()}
			<span class="truncate">{label}</span>
		</svelte:element>
	{/if}
{/if}
