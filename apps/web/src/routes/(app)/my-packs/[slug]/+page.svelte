<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { api } from '@skilless/platform';
	import { useConvexClient } from '@skilless/platform/client';
	import { APP_NAME } from '$lib/constants';
	import {
		cliAddress,
		entryParts,
		githubEntry,
		packAddress,
		parseAddress,
		repoEntry,
		sameAddress,
		skillAddress,
		skillCount
	} from '$lib/pack';
	import { PackEntries } from '$lib/pack-entries.svelte';
	import { search, terms } from '$lib/search';
	import { collapseX } from '$lib/transitions';
	import { copyText } from '$lib/hooks/use-clipboard.svelte';
	import { UseSelection } from '$lib/hooks/use-selection.svelte';
	import SelectSearch from '$lib/components/app/select-search.svelte';
	import { Optimistic } from '$lib/skill-actions.svelte';
	import { submitAction } from '$lib/submit';
	import { confirmDelete } from '$lib/components/ui/confirm-delete-dialog';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as Modal from '$lib/components/ui/modal';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { LoadingButton } from '$lib/components/ui/loading-button';
	import { Textarea } from '$lib/components/ui/textarea';
	import AddSkillsModal, { type Picked } from '$lib/components/app/add-skills-modal.svelte';
	import DetailsPage from '$lib/components/app/details-page.svelte';
	import ListToolbar from '$lib/components/app/list-toolbar.svelte';
	import PackEntry from '$lib/components/app/pack-entry.svelte';
	import PageActions from '$lib/components/app/page-actions.svelte';
	import Snippet from '$lib/components/app/snippet.svelte';
	import { toast } from 'svelte-sonner';
	import RiAddLine from 'remixicon-svelte/icons/add-line';
	import RiBracesLine from 'remixicon-svelte/icons/braces-line';
	import RiDeleteBinLine from 'remixicon-svelte/icons/delete-bin-line';
	import RiErrorWarningLine from 'remixicon-svelte/icons/error-warning-line';
	import RiFileCopyLine from 'remixicon-svelte/icons/file-copy-line';
	import RiExternalLinkLine from 'remixicon-svelte/icons/external-link-line';
	import RiGlobalLine from 'remixicon-svelte/icons/global-line';
	import RiLockLine from 'remixicon-svelte/icons/lock-line';
	import RiMoreFill from 'remixicon-svelte/icons/more-fill';
	import RiPencilLine from 'remixicon-svelte/icons/pencil-line';

	let { data, form } = $props();

	// Live (see +page.server.ts). Optional chained because the header menu
	// outlives this page (see PageActions).
	const view = $derived(data.view?.data);
	const pack = $derived(view?.pack);

	const skills = $derived(data.skills?.data ?? []);

	/** Yours, so every address this page builds is under it. */
	const me = $derived((page.data.username as string | null | undefined) ?? '');

	/** What to type after `skilless add`. */
	const address = $derived(
		pack && me ? cliAddress({ kind: 'pack', username: me, slug: pack.slug }) : undefined
	);

	/** Live queries settle every change, so a reload would only open a second subscription. */
	const options = { keepFocus: true, invalidate: false };

	async function run(action: string, fields: Record<string, string>, failure: string) {
		const result = await submitAction(`?/${action}`, fields, options).catch(() => null);
		if (result?.type === 'success') return true;
		const message = result?.type === 'failure' ? result.data?.message : undefined;
		toast.error(typeof message === 'string' ? message : failure);
		return false;
	}

	/* ----------------------------------------------------------- entries */

	const entries = new PackEntries(
		() => view?.entries ?? [],
		(action, entry) =>
			run(
				action,
				action === 'addEntries' ? { entries: entry } : { entry },
				action === 'addEntries' ? 'Could not add that' : 'Could not remove that'
			)
	);

	const client = useConvexClient();

	/** GitHub entries' repos, scanned for their descriptions if they have not been lately. */
	onMount(() => {
		const keys = (view?.entries ?? []).flatMap((e) => githubEntry(e.entry)?.key ?? []);
		if (keys.length > 0) client.action(api.scans.scan, { keys }).catch(() => {});
	});

	/** The entries matching a pick, however each was written. */
	/** Whether two entries bring the same thing, however each was written. */
	function sameSource(a: string, b: string) {
		if (parseAddress(a)) return sameAddress(a, b);
		const ga = githubEntry(a);
		const gb = githubEntry(b);
		if (ga && gb) return ga.key === gb.key && ga.subpath === gb.subpath;
		return a === b;
	}

	function matching(picked: Picked) {
		return entries.list.filter(({ entry }) => {
			const named = parseAddress(entry);
			if (picked.kind === 'own') {
				return named?.kind === 'skill' && named.username === me && named.name === picked.skill.name;
			}
			if (picked.kind === 'pack') {
				return (
					named?.kind === 'pack' &&
					named.username === picked.pack.username &&
					named.slug === picked.pack.slug
				);
			}
			if (picked.kind === 'source') return sameSource(entry, picked.entry);
			if (picked.kind === 'address') return entry === picked.url || sameAddress(entry, picked.url);
			const github = githubEntry(entry);
			return github?.key === picked.key && github.subpath === (picked.dir ?? '');
		});
	}

	function toggle(picked: Picked, included: boolean) {
		if (!included) {
			for (const { entry } of matching(picked)) entries.remove(entry);
			return;
		}
		if (matching(picked).length > 0) return;

		if (picked.kind === 'own') {
			const { skill } = picked;
			entries.add({
				entry: skillAddress(page.url.origin, me, skill.name),
				skill: {
					username: me,
					name: skill.name,
					description: skill.description,
					public: skill.public === true,
					mine: true
				},
				repo: null,
				pack: null
			});
			return;
		}

		if (picked.kind === 'pack') {
			const { pack } = picked;
			entries.add({
				entry: packAddress(page.url.origin, pack.username, pack.slug),
				skill: null,
				repo: null,
				pack: {
					username: pack.username,
					slug: pack.slug,
					name: pack.name,
					description: pack.description,
					skillCount: pack.skillCount ?? pack.skills?.length ?? 0,
					countPartial: pack.skillCount === undefined || pack.countPartial === true,
					public: pack.public === true,
					mine: pack.owner === undefined,
					owner: pack.owner ?? { name: data.user.name, image: data.user.image, username: me }
				}
			});
			return;
		}

		// one skill out of a pack: its own source, shown as itself until the server resolves it
		if (picked.kind === 'source') {
			const named = parseAddress(picked.entry);
			entries.add({
				entry: picked.entry,
				skill:
					named?.kind === 'skill'
						? {
								username: named.username,
								name: picked.skill.name,
								description: picked.skill.description,
								public: true,
								mine: false
							}
						: null,
				repo: named ? null : { found: true, description: null, skills: [picked.skill] },
				pack: null
			});
			return;
		}

		// what a pasted link holds is the server's to say, once it has it
		if (picked.kind === 'address') {
			entries.add({ entry: picked.url, skill: null, repo: null, pack: null });
			return;
		}

		entries.add({
			entry: repoEntry(picked.key, picked.dir ?? ''),
			skill: null,
			// one skill shows as itself straight away; a whole repo waits on its scan for a count
			repo: picked.skill
				? { found: true, description: picked.description ?? null, skills: [picked.skill] }
				: null,
			pack: null
		});
	}

	/** Your other packs, to include in this one. */
	const otherPacks = $derived((data.packs?.data ?? []).filter((p) => p.slug !== pack?.slug));

	/**
	 * Whether including `candidate` would make a loop: it, or a pack it
	 * includes, already includes this one. Followed through your own packs, which
	 * is all the picker offers; the server checks the rest.
	 */
	function includesThis(candidate: { username: string; slug: string; skills?: string[] }): boolean {
		const mine = new Map((data.packs?.data ?? []).map((p) => [p.slug, p]));
		const isThis = (username: string, slug: string) => username === me && slug === pack?.slug;
		if (isThis(candidate.username, candidate.slug)) return true;
		const known =
			(candidate.username === me ? mine.get(candidate.slug) : undefined) ??
			({ slug: candidate.slug, skills: candidate.skills ?? [] } as const);
		// a throwaway walk, rebuilt on every call: nothing to react to
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const seen = new Set<string>();
		const reaches = (p: { slug: string; skills: readonly string[] }): boolean => {
			if (seen.has(p.slug)) return false;
			seen.add(p.slug);
			return p.skills.some((entry) => {
				const named = parseAddress(entry);
				if (named?.kind !== 'pack') return false;
				if (isThis(named.username, named.slug)) return true;
				// only your own packs can be followed here; the server checks the rest
				const next = named.username === me ? mine.get(named.slug) : undefined;
				return next ? reaches(next) : false;
			});
		};
		return reaches(known);
	}

	let adding = $state(false);

	/** The repos this pack already takes skills from, for the picker to list first. */
	const chosen = $derived.by(() => {
		const repos: Record<string, 'all' | number> = {};
		for (const { entry } of entries.list) {
			const github = githubEntry(entry);
			if (!github) continue;
			const have = repos[github.key];
			if (github.subpath === '') repos[github.key] = 'all';
			else if (have !== 'all') repos[github.key] = (have ?? 0) + 1;
		}
		return repos;
	});

	/* ------------------------------------------------------ search, bulk */

	let query = $state('');

	const queryTerms = $derived(terms(query));

	/** Searched by what each row reads as: a skill or pack by name, a repo by its path. */
	const results = $derived(
		search(
			entries.list.map((view) => {
				const single =
					view.repo?.found && view.repo.skills.length === 1 ? view.repo.skills[0] : null;
				return {
					view,
					name:
						view.skill?.title ??
						view.skill?.name ??
						view.pack?.name ??
						single?.name ??
						entryParts(view.entry).label,
					description:
						view.skill?.description ??
						view.pack?.description ??
						single?.description ??
						view.repo?.description ??
						undefined
				};
			}),
			query
		)
	);

	const selection = new UseSelection(
		() => results.map((row) => row.view),
		(view) => view.entry
	);
	const selected = $derived(selection.selected);

	async function copySelected() {
		const text = selected.map((view) => view.entry).join('\n');
		if ((await copyText(text)) === 'success') toast.success('Copied addresses');
		else toast.error('Could not copy to the clipboard');
	}

	function removeSelected() {
		const doomed = [...selected];
		for (const view of doomed) entries.remove(view.entry);
		selection.clear(doomed);
	}

	/** Your own private skills in a public pack: others will not be able to add them. */
	const privateMine = $derived(
		entries.list.flatMap(({ skill }) => (skill?.mine && !skill.public ? [skill.name] : []))
	);

	/* ------------------------------------------------------------ public */

	/** Moves on click rather than a round trip later, and holds until the live query agrees. */
	const visibility = new Optimistic();
	const isPublic = $derived(visibility.read('pack', pack?.public === true));

	function setPublic(value: boolean) {
		visibility.run('pack', value, () =>
			run('setPublic', { public: String(value) }, 'Could not change who can see it')
		);
	}

	/* ------------------------------------------------------------ details */

	let editing = $state(false);
	let renaming = $state(false);

	function remove() {
		if (!pack) return;
		confirmDelete({
			title: `Delete ${pack.name}?`,
			description:
				'Anyone who added it keeps its skills, but can no longer get updates from it. This cannot be undone.',
			onConfirm: async () => {
				await submitAction('?/remove', {});
			}
		});
	}
</script>

<svelte:head><title>{pack?.name} · {APP_NAME}</title></svelte:head>

<PageActions>
	{#if pack}
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Button {...props} variant="ghost" size="icon-sm" aria-label="Actions for {pack.name}">
						<RiMoreFill class="text-muted-foreground" />
					</Button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end">
				<DropdownMenu.Item onSelect={() => (editing = true)}>
					<RiPencilLine />
					Edit details
				</DropdownMenu.Item>
				{#if isPublic}
					<DropdownMenu.Item onSelect={() => setPublic(false)}>
						<RiLockLine />
						Make private
					</DropdownMenu.Item>
				{:else}
					<DropdownMenu.Item onSelect={() => setPublic(true)}>
						<RiGlobalLine />
						Make public
					</DropdownMenu.Item>
				{/if}
				<DropdownMenu.Separator />
				<DropdownMenu.Item>
					{#snippet child({ props })}
						<a {...props} href="/packs/{me}/{pack.slug}">
							<RiExternalLinkLine />
							View page
						</a>
					{/snippet}
				</DropdownMenu.Item>
				<DropdownMenu.Item>
					{#snippet child({ props })}
						<a {...props} href="/packs/{me}/{pack.slug}.json" target="_blank" rel="noreferrer">
							<RiBracesLine />
							View JSON
						</a>
					{/snippet}
				</DropdownMenu.Item>
				<DropdownMenu.Separator />
				<DropdownMenu.Item variant="destructive" onSelect={remove}>
					<RiDeleteBinLine />
					Delete
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	{/if}
</PageActions>

{#if pack}
	<DetailsPage headerClass="flex flex-col gap-4">
		{#snippet header()}
			<div class="flex flex-col gap-1.5">
				<div class="flex min-w-0 items-center gap-2">
					<h1 class="truncate text-xl font-semibold text-card-foreground">{pack.name}</h1>
					<Tooltip.Root>
						<Tooltip.Trigger class="inline-flex shrink-0 text-muted-foreground">
							{#if isPublic}
								<RiGlobalLine class="size-4" aria-label="Public" />
							{:else}
								<RiLockLine class="size-4" aria-label="Private" />
							{/if}
						</Tooltip.Trigger>
						<Tooltip.Content>
							{isPublic
								? 'Public: anyone with the address can see it and add its skills'
								: 'Private: only you can see it, or add it from the CLI while signed in'}
						</Tooltip.Content>
					</Tooltip.Root>
					<span class="shrink-0 text-xs text-muted-foreground">{skillCount(pack)}</span>
				</div>
				<p class="text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
					{pack.description ?? 'No description'}
				</p>
			</div>

			{#if address}
				<Snippet command="skilless add {address}" class="w-full max-w-xl" />
			{/if}

			{#if isPublic && privateMine.length > 0}
				<div
					role="status"
					class="flex max-w-xl items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3.5 py-3 text-[13px] text-amber-800 dark:text-amber-200"
				>
					<RiErrorWarningLine class="mt-px size-4 shrink-0" aria-hidden="true" />
					<p>
						<span class="font-mono font-semibold">{privateMine.join(', ')}</span>
						{privateMine.length === 1 ? 'is' : 'are'} private, so only you will get
						{privateMine.length === 1 ? 'it' : 'them'} from this pack. Make
						{privateMine.length === 1 ? 'it' : 'them'} public from the skill’s menu for anyone else to.
					</p>
				</div>
			{/if}
		{/snippet}

		{#if entries.list.length === 0}
			<div class="flex flex-col items-center justify-center gap-2 px-8 py-20 text-center">
				<p class="text-sm text-card-foreground">Nothing in this pack yet</p>
				<p class="max-w-sm text-sm text-muted-foreground">
					Add your own skills, or skills from a GitHub repository. A whole repository brings every
					skill in it, including ones added later.
				</p>
				<Button size="sm" class="mt-4" onclick={() => (adding = true)}>
					<RiAddLine />
					Add
				</Button>
			</div>
		{:else}
			<ListToolbar>
				<SelectSearch
					checked={selection.all}
					indeterminate={selection.some}
					onCheckedChange={(checked) => selection.setAll(checked)}
					selectLabel="Select all shown skills"
					placeholder="Search this pack"
					label="Search this pack"
					class="flex-1"
					bind:value={query}
				/>

				<div class="flex shrink-0 items-center gap-2">
					<Button size="sm" onclick={() => (adding = true)}>
						<RiAddLine />
						Add
					</Button>

					<!-- only there while something is checked; grows in beside Add rather than sitting disabled -->
					{#if selected.length > 0}
						<div transition:collapseX>
							<DropdownMenu.Root>
								<DropdownMenu.Trigger>
									{#snippet child({ props })}
										<Button
											{...props}
											variant="outline"
											size="icon-sm"
											aria-label="Actions for {selected.length} selected"
										>
											<RiMoreFill />
										</Button>
									{/snippet}
								</DropdownMenu.Trigger>
								<DropdownMenu.Content align="end">
									<DropdownMenu.Label>{selected.length} selected</DropdownMenu.Label>
									<DropdownMenu.Item onSelect={copySelected}>
										<RiFileCopyLine />
										Copy addresses
									</DropdownMenu.Item>
									<DropdownMenu.Separator />
									<DropdownMenu.Item variant="destructive" onSelect={removeSelected}>
										<RiDeleteBinLine />
										Remove {selected.length} from pack
									</DropdownMenu.Item>
								</DropdownMenu.Content>
							</DropdownMenu.Root>
						</div>
					{/if}
				</div>
			</ListToolbar>

			{#if results.length === 0}
				<p class="px-6 py-16 text-center text-sm text-muted-foreground">
					Nothing in this pack matches “{query.trim()}”.
				</p>
			{/if}

			<ul class="divide-y divide-border [&>li:first-child]:pt-2">
				{#each results as { view } (view.entry)}
					<PackEntry
						entry={view.entry}
						skill={view.skill}
						repo={view.repo}
						pack={view.pack}
						terms={queryTerms}
						scanning={!view.skill && !view.repo && githubEntry(view.entry) !== null}
						selected={selection.has(view)}
						onSelectedChange={(checked) => selection.set(view, checked)}
						onRemove={() => entries.remove(view.entry)}
					/>
				{/each}
			</ul>
		{/if}
	</DetailsPage>

	<AddSkillsModal
		bind:open={adding}
		{skills}
		user={data.user}
		isIncluded={(picked) => matching(picked).length > 0}
		{chosen}
		packs={otherPacks}
		packDisabled={(candidate) =>
			includesThis(candidate) ? `Includes ${pack.name}, so it would make a loop` : undefined}
		onToggle={toggle}
	/>

	<Modal.Root bind:open={editing}>
		<Modal.Content class="sm:max-w-md">
			<form
				method="POST"
				action="?/rename"
				use:enhance={() => {
					renaming = true;
					return async ({ result, update }) => {
						renaming = false;
						if (result.type === 'success') editing = false;
						else await update({ reset: false, invalidateAll: false });
					};
				}}
			>
				<Modal.Header>
					<Modal.Title>Edit details</Modal.Title>
					<Modal.Description>
						The name is what everyone who adds it sees their skills came from.
					</Modal.Description>
				</Modal.Header>

				<div class="flex flex-col gap-5 py-6">
					<div class="flex flex-col gap-2">
						<Label for="pack-name">Name</Label>
						<Input id="pack-name" name="name" autocomplete="off" value={pack.name} />
					</div>
					<div class="flex flex-col gap-2">
						<Label for="pack-description">Description</Label>
						<Textarea
							id="pack-description"
							name="description"
							rows={3}
							value={pack.description ?? ''}
						/>
					</div>
					{#if form?.message}
						<p class="text-[13px] text-destructive" role="alert">{form.message}</p>
					{/if}
				</div>

				<Modal.Footer>
					<Button type="button" variant="ghost" onclick={() => (editing = false)}>Cancel</Button>
					<LoadingButton type="submit" loading={renaming}>Save</LoadingButton>
				</Modal.Footer>
			</form>
		</Modal.Content>
	</Modal.Root>
{/if}
