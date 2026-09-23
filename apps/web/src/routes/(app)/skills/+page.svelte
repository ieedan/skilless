<script lang="ts">
	import { enhance } from '$app/forms';
	import { APP_NAME } from '$lib/constants';
	import { isValidName, NAME_RULES } from '$lib/skill';
	import PageActions from '$lib/components/app/page-actions.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import * as Tabs from '$lib/components/ui/tabs';
	import { Label } from '$lib/components/ui/label';
	import { LoadingButton } from '$lib/components/ui/loading-button';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Button } from '$lib/components/ui/button';
	import ReadingColumn from '$lib/components/app/reading-column.svelte';
	import SkillRow from '$lib/components/app/skill-row.svelte';
	import { downloadZip } from '$lib/download';
	import { SkillActions } from '$lib/skill-actions.svelte';
	import RiAddLine from 'remixicon-svelte/icons/add-line';
	import RiDownload2Line from 'remixicon-svelte/icons/download-2-line';
	import RiMoreFill from 'remixicon-svelte/icons/more-fill';
	import RiSearchLine from 'remixicon-svelte/icons/search-line';
	import { search, terms } from '$lib/search';

	let { data, form } = $props();

	// live subscriptions seeded with the server's data (see hooks.ts)
	const skills = $derived(data.skills.data ?? []);
	const projects = $derived(data.projects.data ?? []);

	type Skill = (typeof skills)[number];

	let query = $state('');
	const queryTerms = $derived(terms(query));
	/** Local means not global — including skills not yet bound to any project. */
	let scope = $state<'all' | 'global' | 'local'>('all');
	const results = $derived(
		search(
			skills.filter((skill) => scope === 'all' || isGlobal(skill) === (scope === 'global')),
			query
		)
	);

	let open = $state(false);
	let creating = $state(false);

	/** The rules only earn their space once the name actually breaks one. */
	let name = $state('');
	const nameInvalid = $derived(name.length > 0 && !isValidName(name));

	/** Optimistic binding and global state, shared with each row's menu. */
	const actions = new SkillActions();

	const isGlobal = (skill: Skill) => actions.isGlobal(skill);
</script>

<svelte:head><title>Skills · {APP_NAME}</title></svelte:head>

<PageActions>
	<Button size="sm" onclick={() => (open = true)}>
		<RiAddLine />
		Create
	</Button>

	<DropdownMenu.Root>
		<DropdownMenu.Trigger>
			{#snippet child({ props })}
				<Button {...props} variant="ghost" size="icon-sm" aria-label="More">
					<RiMoreFill />
				</Button>
			{/snippet}
		</DropdownMenu.Trigger>

		<DropdownMenu.Content align="end">
			<DropdownMenu.Item
				disabled={skills.length === 0}
				onSelect={() => downloadZip('/skills.zip', 'your skills')}
			>
				<RiDownload2Line />
				Download all
			</DropdownMenu.Item>
		</DropdownMenu.Content>
	</DropdownMenu.Root>
</PageActions>

<ReadingColumn>
	{#if skills.length === 0}
		<div class="flex flex-col items-center justify-center gap-2 px-8 py-24 text-center">
			<p class="text-sm text-card-foreground">No skills yet</p>
			<p class="text-sm text-muted-foreground">
				Run <code class="font-mono text-foreground">skilless create &lt;name&gt;</code> to make your first
				one.
			</p>
		</div>
	{:else}
		<div class="mt-4 mb-2 flex items-center gap-2">
			<div class="relative min-w-0 flex-1">
				<RiSearchLine
					class="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
					aria-hidden="true"
				/>
				<Input
					type="search"
					placeholder="Search skills"
					aria-label="Search skills"
					autocomplete="off"
					spellcheck="false"
					class="pl-8"
					bind:value={query}
				/>
			</div>

			<Tabs.Root bind:value={scope}>
				<Tabs.List>
					<Tabs.Trigger value="all">All</Tabs.Trigger>
					<Tabs.Trigger value="global">Global</Tabs.Trigger>
					<Tabs.Trigger value="local">Local</Tabs.Trigger>
				</Tabs.List>
			</Tabs.Root>
		</div>

		{#if results.length === 0}
			<p class="px-6 py-16 text-center text-sm text-muted-foreground">
				{#if query.trim()}
					No {scope === 'all' ? '' : scope} skills match “{query.trim()}”.
				{:else}
					No {scope} skills yet.
				{/if}
			</p>
		{/if}

		<ul class="divide-y divide-border">
			{#each results as skill (skill._id)}
				<SkillRow {skill} {projects} {actions} terms={queryTerms} />
			{/each}
		</ul>
	{/if}
</ReadingColumn>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-md">
		<form
			method="POST"
			action="?/create"
			use:enhance={() => {
				creating = true;
				return async ({ update }) => {
					// a success redirects into the editor; only failures come back here
					await update({ reset: false });
					creating = false;
				};
			}}
		>
			<Dialog.Header>
				<Dialog.Title>Create a skill</Dialog.Title>
				<Dialog.Description>
					We will start you off with a SKILL.md you can edit straight away.
				</Dialog.Description>
			</Dialog.Header>

			<div class="flex flex-col gap-5 py-6">
				<div class="flex flex-col gap-2">
					<Label for="skill-name">Name</Label>
					<Input
						id="skill-name"
						name="name"
						placeholder="resolve-comments"
						autocomplete="off"
						spellcheck="false"
						bind:value={name}
						aria-invalid={nameInvalid}
						aria-describedby={nameInvalid ? 'skill-name-rules' : undefined}
					/>
					{#if nameInvalid}
						<p id="skill-name-rules" class="text-xs text-destructive">{NAME_RULES}</p>
					{/if}
				</div>

				<div class="flex flex-col gap-2">
					<Label for="skill-description">Description</Label>
					<Textarea
						id="skill-description"
						name="description"
						rows={3}
						placeholder="What does this skill do, and when should an agent reach for it?"
						value={form?.description ?? ''}
					/>
				</div>

				<!-- the name rule is already shown under the field -->
				{#if form?.message && !(nameInvalid && form.message === NAME_RULES)}
					<p class="text-[13px] text-destructive" role="alert">{form.message}</p>
				{/if}
			</div>

			<Dialog.Footer>
				<Button type="button" variant="ghost" onclick={() => (open = false)}>Cancel</Button>
				<LoadingButton type="submit" loading={creating}>Create</LoadingButton>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
