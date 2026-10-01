<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import { useConvexClient } from '@skilless/platform/client';
	import { imports, type Pending } from '$lib/imports.svelte';
	import { APP_NAME } from '$lib/constants';
	import { isValidName, NAME_RULES } from '$lib/skill';
	import * as Modal from '$lib/components/ui/modal';
	import { Input } from '$lib/components/ui/input';
	import * as Tabs from '$lib/components/ui/tabs';
	import { Label } from '$lib/components/ui/label';
	import { LoadingButton } from '$lib/components/ui/loading-button';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import * as SplitButton from '$lib/components/ui/split-button';
	import * as Drawer from '$lib/components/ui/drawer';
	import { IsMobile } from '$lib/hooks/is-mobile.svelte';
	import RiArrowDownSLine from 'remixicon-svelte/icons/arrow-down-s-line';
	import AddSkillsModal, { type Picked } from '$lib/components/app/add-skills-modal.svelte';
	import SkillChecklist from '$lib/components/app/skill-checklist.svelte';
	import ListRow from '$lib/components/app/list-row.svelte';
	import SkillOrigin from '$lib/components/app/skill-origin.svelte';
	import ListToolbar from '$lib/components/app/list-toolbar.svelte';
	import SelectSearch from '$lib/components/app/select-search.svelte';
	import SkillRow from '$lib/components/app/skill-row.svelte';
	import { downloadZip } from '$lib/download';
	import { SkillActions } from '$lib/skill-actions.svelte';
	import { UseInfinite } from '$lib/hooks/use-infinite.svelte';
	import RiAddLine from 'remixicon-svelte/icons/add-line';
	import RiDownload2Line from 'remixicon-svelte/icons/download-2-line';
	import RiMoreFill from 'remixicon-svelte/icons/more-fill';
	import { search, terms } from '$lib/search';
	import { UseSelection } from '$lib/hooks/use-selection.svelte';
	import { collapseX } from '$lib/transitions';
	import RiDeleteBinLine from 'remixicon-svelte/icons/delete-bin-line';
	import RiFileCopyLine from 'remixicon-svelte/icons/file-copy-line';
	import RiGlobalLine from 'remixicon-svelte/icons/global-line';
	import RiGitRepositoryLine from 'remixicon-svelte/icons/git-repository-line';
	import RiShareLine from 'remixicon-svelte/icons/share-line';
	import RiRefreshLine from 'remixicon-svelte/icons/refresh-line';
	import RiLockLine from 'remixicon-svelte/icons/lock-line';

	let { data, form } = $props();

	const mobile = new IsMobile();

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

	/* --------------------------------------------------------------- add */

	const client = useConvexClient();

	let adding = $state(false);

	/* --------------------------------------------------- create or add */

	type SplitAction = 'create' | 'add';
	const splitOptions: { value: SplitAction; label: string; description: string }[] = [
		{ value: 'create', label: 'Create', description: 'Start a new skill from scratch.' },
		{ value: 'add', label: 'Add', description: 'Copy skills in from GitHub.' }
	];

	/** What the split button's main half does: the last option picked. */
	let splitAction = $state<SplitAction>('create');
	/** The phone drawer of options. */
	let chooser = $state(false);

	function runAction(action: string) {
		if (action === 'add') adding = true;
		else open = true;
	}

	/** A tick in the picker, with enough to show it in the list while it is added. */
	type Pick = Omit<Pending, 'id' | 'startedAt'>;

	/** `https://github.com/owner/repo.git` as a repo key: `github.com/owner/repo`. */
	const repoKeyOfUrl = (url: string) =>
		url
			.toLowerCase()
			.replace(/^https?:\/\//, '')
			.replace(/\/+$/, '')
			.replace(/\.git$/, '');

	/** A clock difference between here and the server, allowed for when comparing their times. */
	const SKEW_MS = 5_000;

	/**
	 * Whether what a pending row stands for has already landed in the live list,
	 * which can beat the add itself to finishing. A skill from that repo (and
	 * folder, for one skill) written since the add began is the real row, so the
	 * pending one gives way at once rather than the two showing side by side.
	 */
	function landed(pick: Pending) {
		return skills.some(
			(skill) =>
				skill.source !== undefined &&
				repoKeyOfUrl(skill.source.url) === pick.key &&
				(pick.dir === null || skill.source.path === pick.dir) &&
				skill.updatedAt >= pick.startedAt - SKEW_MS
		);
	}
	// an update shows on the skill's own row instead (see SkillRow)
	const pendingRows = $derived(imports.pending.filter((pick) => !pick.update && !landed(pick)));

	/** What is ticked in the picker, by repo and directory; nothing is copied until Add. */
	let picks = $state<Record<string, Pick>>({});
	const pickId = (pick: { key: string; dir: string | null }) => `${pick.key}:${pick.dir ?? '*'}`;
	const pickList = $derived(Object.values(picks));

	/** `https://github.com/owner/repo.git` as the picker keys it: `github.com/owner/repo`. */
	const repoKeyOf = (url: string) =>
		/^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i
			.exec(url)
			?.slice(1)
			.join('/')
			.toLowerCase()
			.replace(/^/, 'github.com/') ?? null;

	/** Your skills that came from GitHub, by repo, then by their directory in it (to the name you keep it under). */
	const owned = $derived.by(() => {
		const repos: Record<string, Record<string, string>> = {};
		for (const skill of skills) {
			const key = skill.source && repoKeyOf(skill.source.url);
			if (!key) continue;
			(repos[key] ??= {})[skill.source!.path] = skill.name;
		}
		return repos;
	});

	/** Why a repo's skill cannot be picked: you have it, or it is on its way. */
	function taken(key: string, dir: string): string | undefined {
		if (owned[key]?.[dir]) return 'Already in your library';
		const coming = imports.pending.some(
			(pick) => pick.key === key && (pick.dir === null || pick.dir === dir)
		);
		return coming ? 'Being added' : undefined;
	}

	/** Repos you have skills from or have picked from, for the picker to list first. */
	const chosen = $derived.by(() => {
		const repos: Record<string, number> = {};
		for (const key of Object.keys(owned)) repos[key] = 0;
		for (const pick of pickList) repos[pick.key] = (repos[pick.key] ?? 0) + 1;
		return repos;
	});

	/** "2 in library · 1 selected", on a chosen repo in the picker. */
	function chosenLabel(key: string) {
		const have = Object.keys(owned[key] ?? {}).length;
		const ticked = pickList.filter((pick) => pick.key === key);
		const all = ticked.some((pick) => pick.dir === null);
		return [
			have > 0 && `${have} in library`,
			all ? 'all selected' : ticked.length > 0 && `${ticked.length} selected`
		]
			.filter(Boolean)
			.join(' · ');
	}

	const toPick = (picked: Picked): Pick | null =>
		picked.kind === 'repo'
			? {
					key: picked.key,
					dir: picked.dir,
					name: picked.skill?.name,
					description: picked.skill?.description ?? picked.description ?? undefined
				}
			: null;

	function togglePick(picked: Picked, included: boolean) {
		const pick = toPick(picked);
		if (!pick) return;
		const id = pickId(pick);
		if (included) picks[id] = pick;
		else delete picks[id];
	}

	/** "2 skills and 1 whole repository", for the Add button's company. */
	const pickedLabel = $derived.by(() => {
		const whole = pickList.filter((pick) => pick.dir === null).length;
		const single = pickList.length - whole;
		return [
			single > 0 && count(single),
			whole > 0 && `${whole} whole ${whole === 1 ? 'repository' : 'repositories'}`
		]
			.filter(Boolean)
			.join(' and ');
	});

	/** Hands the picks to the background and gets out of the way; the list shows them coming. */
	function importPicks() {
		imports.start(client, pickList);
		adding = false;
		picks = {};
	}

	/** Which of the conflicts to replace with the copy from GitHub. */
	let replacing = $state<string[]>([]);

	/** The rules only earn their space once the name actually breaks one. */
	let name = $state('');
	const nameInvalid = $derived(name.length > 0 && !isValidName(name));

	/** Names are lowercase, so fold capitals as they are typed instead of flagging them. */
	function lowercaseName(event: Event & { currentTarget: HTMLInputElement }) {
		const input = event.currentTarget;
		const lower = input.value.toLowerCase();
		if (lower === input.value) return;
		const { selectionStart, selectionEnd } = input;
		input.value = lower;
		input.setSelectionRange(selectionStart, selectionEnd);
		name = lower;
	}

	/** Optimistic binding and global state, shared with each row's menu. */
	const actions = new SkillActions();

	const isGlobal = (skill: Skill) => actions.isGlobal(skill);

	/** Checked rows; actions only reach the ones on screen. */
	const selection = new UseSelection(
		() => results,
		(skill) => skill._id
	);
	const selected = $derived(selection.selected);

	const count = (n: number) => `${n} ${n === 1 ? 'skill' : 'skills'}`;
	/** "Make global" when it covers the whole selection (or none of it); "Make 2 global" when only some qualify. */
	const only = (eligible: Skill[], verb: string, rest: string) =>
		eligible.length === 0 || eligible.length === selected.length
			? `${verb} ${rest}`
			: `${verb} ${eligible.length} ${rest}`;
	const globalable = $derived(selected.filter((skill) => !isGlobal(skill)));
	const localable = $derived(selected.filter((skill) => isGlobal(skill)));
	const publishable = $derived(selected.filter((skill) => !actions.isPublic(skill)));
	const privatable = $derived(selected.filter((skill) => actions.isPublic(skill)));
	const updatable = $derived(
		selected.filter((skill) => actions.canUpdate(skill) && !imports.isUpdating(skill.name))
	);

	/** Public or private for many at once, with one toast for the lot rather than one each. */
	async function setPublicMany(skills: Skill[], value: boolean) {
		const results = await Promise.all(
			skills.map((skill) => actions.setPublic(skill, value, { quiet: true }))
		);
		const done = results.filter(Boolean).length;
		if (done > 0) {
			toast.success(value ? `Anyone can now see ${count(done)}` : `${count(done)} made private`);
		}
	}

	function download(skills: Skill[]) {
		const query = skills.map((skill) => `name=${encodeURIComponent(skill.name)}`).join('&');
		downloadZip(
			`/my-skills.zip?${query}`,
			skills.length === 1 ? skills[0].name : count(skills.length)
		);
	}
</script>

<svelte:head><title>Skills · {APP_NAME}</title></svelte:head>

<!-- Create starts a skill from scratch; Add copies them in from GitHub -->
{#snippet createOrAdd()}
	<SplitButton.Root bind:value={splitAction} onclick={({ action }) => runAction(action)}>
		<SplitButton.Action value="create" size="sm">
			<RiAddLine />
			Create
		</SplitButton.Action>
		<SplitButton.Action value="add" size="sm">
			<RiAddLine />
			Add
		</SplitButton.Action>
		{#if mobile.current}
			<!-- on a phone, picking from the drawer does it there and then: no second tap on the button -->
			<Drawer.Root bind:open={chooser}>
				<Drawer.Trigger
					class={buttonVariants({ size: 'icon-sm' })}
					aria-label="More ways to add skills"
				>
					<RiArrowDownSLine />
				</Drawer.Trigger>
				<Drawer.Content>
					<Drawer.Header>
						<Drawer.Title>Add skills</Drawer.Title>
						<Drawer.Description class="sr-only">Create a skill, or copy some in.</Drawer.Description
						>
					</Drawer.Header>
					{#each splitOptions as option (option.value)}
						<Drawer.Item
							onclick={() => {
								splitAction = option.value;
								// straight on: the next drawer rises as this one falls, rather than after
								chooser = false;
								runAction(option.value);
							}}
						>
							<RiAddLine />
							<span class="flex flex-col gap-0.5">
								<span class="font-medium">{option.label}</span>
								<span class="text-xs text-muted-foreground">{option.description}</span>
							</span>
						</Drawer.Item>
					{/each}
				</Drawer.Content>
			</Drawer.Root>
		{:else}
			<SplitButton.Select>
				<SplitButton.SelectTrigger size="icon-sm" aria-label="More ways to add skills" />
				<SplitButton.SelectContent>
					{#each splitOptions as option (option.value)}
						<SplitButton.SelectAction value={option.value} label={option.label}>
							<span class="flex flex-col gap-0.5">
								<span class="font-medium">{option.label}</span>
								<span class="text-xs text-muted-foreground">{option.description}</span>
							</span>
						</SplitButton.SelectAction>
					{/each}
				</SplitButton.SelectContent>
			</SplitButton.Select>
		{/if}
	</SplitButton.Root>
{/snippet}

{#snippet pageActions()}
	<div class="flex shrink-0 items-center gap-2">
		{@render createOrAdd()}

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
							<!-- disabled rather than hidden, like the rest, so the menu does not reshuffle -->
							<DropdownMenu.Item
								disabled={updatable.length === 0}
								onSelect={() => actions.updateManyFromSource(updatable)}
							>
								<RiRefreshLine />
								{only(updatable, 'Update', 'from source')}
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

						<DropdownMenu.Group>
							<DropdownMenu.Item
								disabled={publishable.length === 0}
								onSelect={() => setPublicMany(publishable, true)}
							>
								<RiShareLine />
								{only(publishable, 'Make', 'public')}
							</DropdownMenu.Item>
							<DropdownMenu.Item
								disabled={privatable.length === 0}
								onSelect={() => setPublicMany(privatable, false)}
							>
								<RiLockLine />
								{only(privatable, 'Make', 'private')}
							</DropdownMenu.Item>
						</DropdownMenu.Group>

						<DropdownMenu.Separator />

						<DropdownMenu.Item
							variant="destructive"
							onSelect={() => {
								const doomed = [...selected];
								actions.removeMany(doomed, () => selection.clear(doomed));
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

{#if skills.length === 0 && pendingRows.length === 0}
	<div class="flex flex-col items-center justify-center gap-2 px-8 py-24 text-center">
		<p class="text-sm text-card-foreground">No skills yet</p>
		<p class="text-sm text-muted-foreground">
			Run <code class="font-mono text-foreground">skilless create &lt;name&gt;</code> to make your first
			one.
		</p>
		<div class="mt-4">{@render createOrAdd()}</div>
	</div>
{:else}
	<!-- on a phone, just search and Create: the filters and the rarely wanted extras wait for a wider screen -->
	<ListToolbar>
		<SelectSearch
			checked={selection.all}
			indeterminate={selection.some}
			onCheckedChange={(checked) => selection.setAll(checked)}
			selectLabel="Select all shown skills"
			placeholder="Search skills"
			label="Search skills"
			class="flex-1"
			bind:value={
				() => query,
				(value) => {
					query = value;
					list.reset();
				}
			}
		/>

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
	</ListToolbar>

	{#if results.length === 0 && pendingRows.length === 0}
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
		<!-- on their way in from GitHub; the real rows take over as each lands -->
		{#each pendingRows as pick (pick.id)}
			<!-- dressed as the row it will become, as far as is known before it lands -->
			<ListRow
				busy
				mono={pick.name !== undefined}
				title={pick.name ?? pick.key.replace(/^github\.com\//, '')}
				description={pick.description}
				empty={pick.name ? 'No description' : 'Every skill in this repository'}
			>
				{#snippet meta()}
					{#if pick.name}
						<span class="shrink-0 text-xs text-muted-foreground">0 projects</span>
					{/if}
					<SkillOrigin source={{ url: `https://${pick.key}.git`, path: pick.dir ?? '' }} />
				{/snippet}
			</ListRow>
		{/each}
		{#each list.slice(results) as skill (skill._id)}
			<SkillRow
				{skill}
				{projects}
				{actions}
				terms={queryTerms}
				selected={selection.has(skill)}
				onSelectedChange={(checked) => selection.set(skill, checked)}
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
						oninput={lowercaseName}
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

<AddSkillsModal
	bind:open={adding}
	isIncluded={(picked) => {
		const pick = toPick(picked);
		return pick !== null && pickId(pick) in picks;
	}}
	{chosen}
	chosenHeading="Added or selected"
	{chosenLabel}
	repoTaken={taken}
	followsRepo={false}
	onToggle={togglePick}
>
	{#snippet footer()}
		{#if pickList.length > 0}
			<p class="mr-auto self-center text-[13px] text-muted-foreground">{pickedLabel}</p>
		{/if}
		<Button disabled={pickList.length === 0} onclick={importPicks}>Add to library</Button>
	{/snippet}
</AddSkillsModal>

<Modal.Root
	bind:open={
		() => imports.reviewing && imports.conflicts.length > 0,
		(value) => {
			if (!value) imports.dismiss();
		}
	}
>
	<Modal.Content class="flex max-h-[85dvh] flex-col gap-0 sm:max-w-lg">
		<Modal.Header>
			<Modal.Title>Already in your library</Modal.Title>
		</Modal.Header>
		<Modal.Description class="text-left">
			You have {imports.conflicts.length === 1 ? 'a different skill' : 'different skills'} by
			{imports.conflicts.length === 1 ? 'this name' : 'these names'}. Tick any to replace with the
			copy from GitHub; the rest stay as they are.
		</Modal.Description>

		<div class="flex min-h-0 flex-col pt-4">
			<SkillChecklist
				items={imports.conflicts.map((conflict) => ({
					...conflict,
					id: conflict.name,
					description: conflict.dir ? `${conflict.key}/${conflict.dir}` : conflict.key
				}))}
				placeholder="Filter skills"
				isChecked={(conflict) => replacing.includes(conflict.name)}
				onToggle={(conflict, checked) =>
					(replacing = checked
						? [...replacing, conflict.name]
						: replacing.filter((name) => name !== conflict.name))}
			/>
		</div>

		<Modal.Footer class="pt-4">
			<Button type="button" variant="ghost" onclick={() => imports.dismiss()}>Keep mine</Button>
			<Button
				disabled={replacing.length === 0}
				onclick={() => {
					imports.replace(client, replacing);
					replacing = [];
				}}
			>
				Replace{replacing.length > 0 ? ` ${count(replacing.length)}` : ''}
			</Button>
		</Modal.Footer>
	</Modal.Content>
</Modal.Root>
