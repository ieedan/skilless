<script lang="ts">
	import type { FunctionReturnType } from 'convex/server';
	import type { api } from '@skilless/platform';
	import { APP_NAME } from '$lib/constants';
	import * as NavTabs from '$lib/components/ui/nav-tabs';
	import { Button } from '$lib/components/ui/button';
	import { page } from '$app/state';
	import AddSkillButton from './add-skill-button.svelte';
	import Avatar from './avatar.svelte';
	import GithubLogo from './github-logo.svelte';
	import ListRow from './list-row.svelte';
	import { skillCount } from '$lib/pack';

	/** A user's public skills and packs, one tab each, each at its own address. */
	let {
		username,
		user,
		tab
	}: {
		username: string;
		user: NonNullable<FunctionReturnType<typeof api.users.page>>;
		tab: 'skills' | 'packs';
	} = $props();

	const plural = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`;

	/** Signed in, and not your own page: then each skill can be added to your library. */
	const canAdd = $derived(page.data.signedIn === true && !user.mine);
</script>

<svelte:head>
	<title>{user.owner.name} · {APP_NAME}</title>
	<meta
		name="description"
		content="{user.owner.name}'s skills and packs on {APP_NAME}: {plural(
			user.skills.length,
			'skill'
		)}, {plural(user.packs.length, 'pack')}."
	/>
</svelte:head>

<header class="flex items-center gap-4 pt-10 pb-6">
	<Avatar seed={user.owner.name} src={user.owner.image} size={56} />
	<div class="flex min-w-0 flex-1 flex-col gap-1">
		<h1 class="truncate text-2xl font-semibold text-foreground">{user.owner.name}</h1>
		<p class="truncate text-sm text-muted-foreground">@{user.owner.login}</p>
	</div>
	<Button
		href="https://github.com/{user.owner.login}"
		target="_blank"
		rel="noreferrer"
		variant="ghost"
		size="icon-sm"
		aria-label="{user.owner.login} on GitHub"
	>
		<GithubLogo class="size-4" />
	</Button>
</header>

<NavTabs.Root aria-label="What they have shared" class="border-b border-border">
	<NavTabs.Link href="/skills/{username}" active={tab === 'skills'}>
		Skills <span class="text-xs text-muted-foreground">{user.skills.length}</span>
	</NavTabs.Link>
	<NavTabs.Link href="/packs/{username}" active={tab === 'packs'}>
		Packs <span class="text-xs text-muted-foreground">{user.packs.length}</span>
	</NavTabs.Link>
</NavTabs.Root>

{#if tab === 'skills'}
	{#if user.skills.length === 0}
		<p class="py-16 text-center text-sm text-muted-foreground">No public skills yet.</p>
	{:else}
		<ul class="divide-y divide-border">
			{#each user.skills as skill (skill.name)}
				<ListRow
					title={skill.title ?? skill.name}
					href="/skills/{username}/{skill.name}"
					mono
					description={skill.description}
				>
					{#snippet actions()}
						{#if canAdd}
							<AddSkillButton {username} name={skill.name} added={skill.added} />
						{/if}
					{/snippet}
				</ListRow>
			{/each}
		</ul>
	{/if}
{:else if user.packs.length === 0}
	<p class="py-16 text-center text-sm text-muted-foreground">No public packs yet.</p>
{:else}
	<ul class="divide-y divide-border">
		{#each user.packs as pack (pack.slug)}
			<ListRow
				title={pack.name}
				href="/packs/{username}/{pack.slug}"
				description={pack.description}
			>
				{#snippet meta()}
					<span class="shrink-0 text-xs text-muted-foreground"
						>{skillCount({ ...pack, skills: [] })}</span
					>
				{/snippet}
			</ListRow>
		{/each}
	</ul>
{/if}
