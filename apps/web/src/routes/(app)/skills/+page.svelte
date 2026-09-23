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
	import SkillMenu from '$lib/components/app/skill-menu.svelte';
	import { downloadZip } from '$lib/download';
	import { SkillActions } from '$lib/skill-actions.svelte';
	import RiAddLine from 'remixicon-svelte/icons/add-line';
	import RiDownload2Line from 'remixicon-svelte/icons/download-2-line';
	import RiGlobalLine from 'remixicon-svelte/icons/global-line';
	import RiMoreFill from 'remixicon-svelte/icons/more-fill';
	import RiSearchLine from 'remixicon-svelte/icons/search-line';
	import { around, highlight, search, terms } from '$lib/search';

	let { data, form } = $props();

	// live subscriptions seeded with the server's data (see hooks.ts)
	const skills = $derived(data.skills.data ?? []);
	const projects = $derived(data.projects.data ?? []);

	type Skill = (typeof skills)[number];
	type Project = (typeof projects)[number];

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

	/** A one-file skill has nothing to browse, so link straight at the file. */
	const href = (skill: Skill) =>
		skill.soleFile
			? `/skills/${encodeURIComponent(skill.name)}/${skill.soleFile}`
			: `/skills/${encodeURIComponent(skill.name)}`;

	/** Optimistic binding and global state, shared with each row's menu. */
	const actions = new SkillActions();

	const isGlobal = (skill: Skill) => actions.isGlobal(skill);

	/** Counted through `isBound` so the count moves with the checkbox, not a round trip later. */
	const projectCount = (skill: Skill) => projects.filter((p) => actions.isBound(skill, p)).length;
</script>

{#snippet marked(text: string)}
	<!-- one line: whitespace between segments would render as stray spaces -->
	{#each highlight(text, queryTerms) as segment, i (i)}{#if segment.match}<mark
				class="bg-primary/20 text-foreground">{segment.text}</mark
			>{:else}{segment.text}{/if}{/each}
{/snippet}

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
				<li class="group/row relative flex items-center justify-between gap-4 py-3.5">
					<a href={href(skill)} class="flex min-w-0 flex-col gap-1.5">
						<!-- stretched so the whole row is the hit target, without nesting the menu inside the link -->
						<span class="absolute inset-0" aria-hidden="true"></span>
						<span class="flex min-w-0 items-center gap-2">
							<span class="truncate font-mono text-sm font-semibold text-card-foreground">
								{@render marked(skill.name)}
							</span>
							{#if isGlobal(skill)}
								<span class="inline-flex shrink-0" title="Installed globally">
									<RiGlobalLine class="size-3.5 text-muted-foreground" aria-hidden="true" />
								</span>
								<span class="sr-only">Global</span>
							{:else}
								{@const count = projectCount(skill)}
								<span class="shrink-0 text-xs text-muted-foreground">
									{count}
									{count === 1 ? 'project' : 'projects'}
								</span>
							{/if}
						</span>
						<!--
							Two lines rather than one: descriptions come from SKILL.md
							frontmatter and are often a full sentence, which a single
							truncated line cuts to almost nothing at this width.
						-->
						<span class="line-clamp-2 text-[13px] text-muted-foreground">
							{#if skill.description}
								{@render marked(around(skill.description, queryTerms))}
							{:else}
								No description
							{/if}
						</span>
					</a>

					<div class="relative flex shrink-0 items-center gap-3">
						<SkillMenu {skill} {projects} {actions} />
					</div>
				</li>
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
