<script lang="ts">
	import { enhance } from '$app/forms';
	import { APP_NAME } from '$lib/constants';
	import { isValidName, NAME_RULES } from '$lib/skill';
	import * as Modal from '$lib/components/ui/modal';
	import { Input } from '$lib/components/ui/input';
	import * as Tabs from '$lib/components/ui/tabs';
	import { Label } from '$lib/components/ui/label';
	import { LoadingButton } from '$lib/components/ui/loading-button';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Button } from '$lib/components/ui/button';
	import SearchInput from '$lib/components/app/search-input.svelte';
	import SkillRow from '$lib/components/app/skill-row.svelte';
	import { downloadZip } from '$lib/download';
	import { SkillActions } from '$lib/skill-actions.svelte';
	import { UseInfinite } from '$lib/hooks/use-infinite.svelte';
	import RiAddLine from 'remixicon-svelte/icons/add-line';
	import RiDownload2Line from 'remixicon-svelte/icons/download-2-line';
	import RiMoreFill from 'remixicon-svelte/icons/more-fill';
	import { search, terms } from '$lib/search';
	import { SvelteSet } from 'svelte/reactivity';
	import { collapseX } from '$lib/transitions';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import RiDeleteBinLine from 'remixicon-svelte/icons/delete-bin-line';
	import RiFileCopyLine from 'remixicon-svelte/icons/file-copy-line';
	import RiGlobalLine from 'remixicon-svelte/icons/global-line';
	import RiGitRepositoryLine from 'remixicon-svelte/icons/git-repository-line';

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

	/** Rows go on screen a page at a time; a new search or scope starts back at the top. */
	const list = new UseInfinite();

	let open = $state(false);
	let creating = $state(false);

	/** The rules only earn their space once the name actually breaks one. */
	let name = $state('');
	const nameInvalid = $derived(name.length > 0 && !isValidName(name));

	/** Optimistic binding and global state, shared with each row's menu. */
	const actions = new SkillActions();

	const isGlobal = (skill: Skill) => actions.isGlobal(skill);

	/**
	 * Checked rows, by id. Actions only reach the ones on screen, so a skill the
	 * filter hides is never deleted or downloaded without being seen; and a
	 * skill deleted elsewhere just drops out.
	 */
	const selection = new SvelteSet<string>();
	const selected = $derived(results.filter((skill) => selection.has(skill._id)));
	const allSelected = $derived(results.length > 0 && selected.length === results.length);

	function selectAll(checked: boolean) {
		for (const skill of results) {
			if (checked) selection.add(skill._id);
			else selection.delete(skill._id);
		}
	}

	const count = (n: number) => `${n} ${n === 1 ? 'skill' : 'skills'}`;
	/** "Make global" when it covers the whole selection (or none of it); "Make 2 global" when only some qualify. */
	const only = (eligible: Skill[], verb: string, rest: string) =>
		eligible.length === 0 || eligible.length === selected.length
			? `${verb} ${rest}`
			: `${verb} ${eligible.length} ${rest}`;
	const globalable = $derived(selected.filter((skill) => !isGlobal(skill)));
	const localable = $derived(selected.filter((skill) => isGlobal(skill)));

	function download(skills: Skill[]) {
		const query = skills.map((skill) => `name=${encodeURIComponent(skill.name)}`).join('&');
		downloadZip(
			`/skills.zip?${query}`,
			skills.length === 1 ? skills[0].name : count(skills.length)
		);
	}
</script>

<svelte:head><title>Skills · {APP_NAME}</title></svelte:head>

{#snippet pageActions()}
	<div class="flex shrink-0 items-center gap-2">
		<Button size="sm" onclick={() => (open = true)}>
			<RiAddLine />
			Create
		</Button>

		<!-- only there while something is checked; grows in beside Create rather than sitting disabled -->
		{#if selected.length > 0}
			<div transition:collapseX>
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button
								{...props}
								variant="outline"
								size="icon-sm"
								aria-label="Actions for {count(selected.length)}"
							>
								<RiMoreFill />
							</Button>
						{/snippet}
					</DropdownMenu.Trigger>

					<DropdownMenu.Content align="end">
						<DropdownMenu.Label>{count(selected.length)} selected</DropdownMenu.Label>
						<DropdownMenu.Group>
							<DropdownMenu.Item onSelect={() => actions.copyInstallAll(selected)}>
								<RiFileCopyLine />
								Copy install command
							</DropdownMenu.Item>
							<DropdownMenu.Item onSelect={() => download(selected)}>
								<RiDownload2Line />
								Download
							</DropdownMenu.Item>
						</DropdownMenu.Group>

						<DropdownMenu.Separator />

						<!-- disabled rather than hidden when nothing qualifies, so the menu does not reshuffle -->
						<DropdownMenu.Group>
							<DropdownMenu.Item
								disabled={globalable.length === 0}
								onSelect={() => globalable.forEach((skill) => actions.setGlobal(skill, true))}
							>
								<RiGlobalLine />
								{only(globalable, 'Make', 'global')}
							</DropdownMenu.Item>
							<DropdownMenu.Item
								disabled={localable.length === 0}
								onSelect={() => localable.forEach((skill) => actions.setGlobal(skill, false))}
							>
								<RiGitRepositoryLine />
								{only(localable, 'Make', 'local')}
							</DropdownMenu.Item>
						</DropdownMenu.Group>

						<DropdownMenu.Separator />

						<DropdownMenu.Item
							variant="destructive"
							onSelect={() => {
								const doomed = [...selected];
								actions.removeMany(doomed, () =>
									doomed.forEach((skill) => selection.delete(skill._id))
								);
							}}
						>
							<RiDeleteBinLine />
							Delete {count(selected.length)}
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			</div>
		{/if}
	</div>
{/snippet}

{#if skills.length === 0}
	<div class="flex flex-col items-center justify-center gap-2 px-8 py-24 text-center">
		<p class="text-sm text-card-foreground">No skills yet</p>
		<p class="text-sm text-muted-foreground">
			Run <code class="font-mono text-foreground">skilless create &lt;name&gt;</code> to make your first
			one.
		</p>
		<Button size="sm" class="mt-4" onclick={() => (open = true)}>
			<RiAddLine />
			Create
		</Button>
	</div>
{:else}
	<!-- on a phone, just search and Create: the filters and the rarely wanted extras wait for a wider screen -->
	<div class="mt-4 mb-2 flex items-center gap-2">
		<!--
			Select-all and search as one field. The checkbox's cell is the same
			width as the rows' (see SkillRow), so every checkbox sits on one line.
			The ring follows the text field only: checking the box is not typing.
		-->
		<div
			class="flex h-8 min-w-0 flex-1 items-center rounded-lg border border-input shadow-xs transition-colors has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-3 has-[input:focus-visible]:ring-ring/50"
		>
			<div
				class="relative flex h-full w-9 shrink-0 items-center justify-center after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-input"
			>
				<!-- takes in only what the filter shows -->
				<Checkbox
					checked={allSelected}
					indeterminate={selected.length > 0 && !allSelected}
					onCheckedChange={selectAll}
					aria-label="Select all shown skills"
				/>
			</div>
			<SearchInput
				placeholder="Search skills"
				aria-label="Search skills"
				class="h-full min-w-0 flex-1"
				inputClass="h-full rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
				bind:value={
					() => query,
					(value) => {
						query = value;
						list.reset();
					}
				}
			/>
		</div>

		<Tabs.Root
			bind:value={
				() => scope,
				(value) => {
					scope = value as typeof scope;
					list.reset();
				}
			}
			class="max-sm:hidden"
		>
			<Tabs.List>
				<Tabs.Trigger value="all">All</Tabs.Trigger>
				<Tabs.Trigger value="global">Global</Tabs.Trigger>
				<Tabs.Trigger value="local">Local</Tabs.Trigger>
			</Tabs.List>
		</Tabs.Root>

		{@render pageActions()}
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

	<!-- nothing above the first row to clear, so it sits closer to the search -->
	<ul class="divide-y divide-border [&>li:first-child]:pt-2">
		{#each list.slice(results) as skill (skill._id)}
			<SkillRow
				{skill}
				{projects}
				{actions}
				terms={queryTerms}
				selected={selection.has(skill._id)}
				onSelectedChange={(checked) =>
					checked ? selection.add(skill._id) : selection.delete(skill._id)}
			/>
		{/each}
	</ul>

	{#if list.more(results)}
		<div {@attach list.sentinel} aria-hidden="true"></div>
	{/if}
{/if}

<Modal.Root bind:open>
	<Modal.Content class="sm:max-w-md">
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
			<Modal.Header>
				<Modal.Title>Create a skill</Modal.Title>
				<Modal.Description>
					We will start you off with a SKILL.md you can edit straight away.
				</Modal.Description>
			</Modal.Header>

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

			<Modal.Footer>
				<Button type="button" variant="ghost" onclick={() => (open = false)}>Cancel</Button>
				<LoadingButton type="submit" loading={creating}>Create</LoadingButton>
			</Modal.Footer>
		</form>
	</Modal.Content>
</Modal.Root>
