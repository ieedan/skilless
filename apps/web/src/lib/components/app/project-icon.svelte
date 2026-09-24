<script lang="ts">
	import type { ProjectParts } from '$lib/project';
	import RiGitRepositoryLine from 'remixicon-svelte/icons/git-repository-line';
	import GithubLogo from './github-logo.svelte';
	import GitlabLogo from './gitlab-logo.svelte';

	let {
		parts,
		size = 'sm',
		surface = 'bg-card',
		class: className = ''
	}: {
		parts: ProjectParts;
		/** `sm` for menu rows, `md` for list rows, `lg` for a page header. */
		size?: 'sm' | 'md' | 'lg';
		/** The background the icon sits on, so the host badge's ring blends into it. */
		surface?: string;
		class?: string;
	} = $props();

	const SIZES = {
		sm: { box: 'size-5', badge: 'size-3 -right-1 -bottom-1', mark: 'size-2.5' },
		md: { box: 'size-8', badge: 'size-4 -right-1 -bottom-1', mark: 'size-3' },
		lg: { box: 'size-10', badge: 'size-5 -right-1 -bottom-1', mark: 'size-3.5' }
	};

	const s = $derived(SIZES[size]);

	/**
	 * The avatar that failed to load, so it falls back to the host logo. Kept as
	 * the src rather than a flag so a different project gets a fresh try.
	 */
	let failed = $state<string | null>(null);
	const broken = $derived(failed !== null && failed === parts.avatar);
</script>

<span class="relative shrink-0 {s.box} {className}">
	{#if parts.avatar && !broken}
		<img
			src={parts.avatar}
			alt=""
			class="{s.box} rounded-full bg-muted"
			onerror={() => (failed = parts.avatar ?? null)}
		/>
		<span class="absolute flex items-center justify-center rounded-full {surface} {s.badge}">
			<GithubLogo class={s.mark} />
		</span>
	{:else if parts.host === 'github'}
		<GithubLogo class={s.box} />
	{:else if parts.host === 'gitlab'}
		<GitlabLogo class={s.box} />
	{:else}
		<RiGitRepositoryLine class="{s.box} text-muted-foreground" />
	{/if}
</span>
