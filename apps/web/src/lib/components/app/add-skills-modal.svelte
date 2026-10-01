<script lang="ts" module>
	/** One of your skills, as the picker lists it. */
	export type OwnSkill = {
		_id: string;
		name: string;
		description?: string;
		public?: boolean;
	};

	/** One of your packs, as the picker lists it. */
	export type OwnPack = {
		_id: string;
		slug: string;
		name: string;
		description?: string;
		public?: boolean;
		skillCount?: number;
		countPartial?: boolean;
		skills: string[];
	};

	/** A pack, as picked: one of yours, or anyone's opened by its link. */
	export type PackInfo = {
		/** Its owner's username and its slug: its address. */
		username: string;
		slug: string;
		name: string;
		description?: string;
		public?: boolean;
		skillCount?: number;
		countPartial?: boolean;
		/** Its entries, when known: what a loop check follows. */
		skills?: string[];
		owner?: { name: string; image: string | null; username: string | null };
	};

	/**
	 * What was picked: one of your skills, a skill in a GitHub repo, a whole
	 * repo (`dir: null`), which brings every skill in it including ones added
	 * later, a whole pack, which likewise follows it, one skill out of a pack
	 * (`source`, by the entry that brings it alone), or a pack hosted elsewhere
	 * by its address.
	 */
	export type Picked =
		| { kind: 'own'; skill: OwnSkill }
		| { kind: 'pack'; pack: PackInfo }
		| { kind: 'source'; entry: string; skill: { name: string; description?: string } }
		| { kind: 'address'; url: string }
		| {
				kind: 'repo';
				key: string;
				dir: string | null;
				skill?: { name: string; description?: string; dir?: string; sole?: boolean };
				description?: string | null;
		  };
</script>

<script lang="ts">
	import { untrack, type Snippet } from 'svelte';
	import type { FunctionReturnType } from 'convex/server';
	import { api } from '@skilless/platform';
	import { useConvexClient, useQuery } from '@skilless/platform/client';
	import { projectParts } from '$lib/project';
	import { parseAddress, typedRepoKey } from '$lib/pack';
	import { page } from '$app/state';
	import { search } from '$lib/search';
	import { UseRepos } from '$lib/hooks/use-repos.svelte';
	import * as Modal from '$lib/components/ui/modal';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import Avatar from './avatar.svelte';
	import GithubLogo from './github-logo.svelte';
	import ProjectIcon from './project-icon.svelte';
	import SearchInput from './search-input.svelte';
	import SkillChecklist from './skill-checklist.svelte';
	import RiArrowLeftLine from 'remixicon-svelte/icons/arrow-left-line';
	import RiArrowRightSLine from 'remixicon-svelte/icons/arrow-right-s-line';
	import RiCheckLine from 'remixicon-svelte/icons/check-line';
	import RiLockLine from 'remixicon-svelte/icons/lock-line';
	import RiStackLine from 'remixicon-svelte/icons/stack-line';

	let {
		open = $bindable(false),
		skills,
		user,
		isIncluded,
		onToggle,
		chosen = {},
		packs,
		packDisabled,
		github = true,
		ownDisabled,
		followsRepo = true,
		repoTaken,
		chosenHeading = 'Selected',
		chosenLabel,
		footer
	}: {
		open?: boolean;
		/** Your library. Only skills with an address can be picked. Leave out where it makes no sense, like your library itself. */
		skills?: OwnSkill[];
		/** Whose library it is, for the picture on its card. */
		user?: { seed: string; image: string | null };
		isIncluded: (picked: Picked) => boolean;
		onToggle: (picked: Picked, included: boolean) => void;
		/**
		 * Repos already picked from, by key: `'all'` for the whole repo, or how
		 * many of its skills. They head the repo list, in a group of their own.
		 */
		chosen?: Record<string, 'all' | number>;
		/** Your packs, to include in this one. Leave out where packs make no sense. */
		packs?: OwnPack[];
		/** Why a whole pack cannot be picked, e.g. it would make a loop. Its skills still can. */
		packDisabled?: (pack: PackInfo) => string | undefined;
		/** Offer GitHub repos. Off where only your library can be added from, like a project. */
		github?: boolean;
		/** Why one of your skills cannot be picked, e.g. it is already there anyway. */
		ownDisabled?: (skill: OwnSkill) => string | undefined;
		/** Whether picking a whole repo follows it, so skills added to it later come too. */
		followsRepo?: boolean;
		/** Why a repo's skill is already there, e.g. it is in your library: shown ticked, and locked. */
		repoTaken?: (key: string, dir: string) => string | undefined;
		/** What the group of `chosen` repos is called. */
		chosenHeading?: string;
		/** The badge on a `chosen` repo, in place of how many are selected. */
		chosenLabel?: (key: string) => string;
		/** In place of Done, wherever skills are ticked. */
		footer?: Snippet;
	} = $props();

	type Step =
		| { name: 'choose' }
		| { name: 'mine' }
		| { name: 'packs' }
		| { name: 'pack'; username: string; slug: string }
		| { name: 'repos' }
		| { name: 'repo'; key: string };

	/** With one source, there is nothing to choose between. */
	const start = (): Step => {
		const sources = [skills && 'mine', github && 'repos', packs && 'packs'].filter(Boolean);
		if (sources.length > 1) return { name: 'choose' };
		return { name: sources[0] === 'repos' ? 'repos' : 'mine' };
	};
	const first = $derived(start());

	/** Whether a skill is private only matters where it gets shared, i.e. a pack. */
	const sharing = $derived(first.name === 'choose');

	let step = $state<Step>(start());

	const client = useConvexClient();
	const repos = new UseRepos();

	const own = $derived((skills ?? []).map((skill) => ({ ...skill, id: skill._id })));

	/* ------------------------------------------------------------ packs */

	/** A pack's link pasted in: a skilless pack opens like one of yours; any other is taken whole. */
	let address = $state('');

	function openAddress(event: SubmitEvent) {
		event.preventDefault();
		const url = address.trim();
		if (!url) return;
		address = '';

		const named = parseAddress(url);
		if (named?.kind === 'pack') step = { name: 'pack', username: named.username, slug: named.slug };
		else onToggle({ kind: 'address', url }, true);
	}

	const packCount = (pack: Pick<PackInfo, 'skillCount' | 'countPartial' | 'skills'>) => {
		const n = pack.skillCount ?? pack.skills?.length ?? 0;
		const partial = pack.skillCount === undefined || pack.countPartial === true;
		return `${n}${partial && n > 0 ? '+' : ''} ${n === 1 && !partial ? 'skill' : 'skills'}`;
	};

	/* ------------------------------------------------------------- pack */

	const selectedPack = $derived(
		step.name === 'pack' ? { username: step.username, slug: step.slug } : null
	);
	const opened = useQuery(api.packs.skillsOf, () => selectedPack ?? 'skip');

	const wholePack = $derived<Picked | null>(
		opened.data ? { kind: 'pack', pack: opened.data.pack } : null
	);
	const wholePackIncluded = $derived(wholePack ? isIncluded(wholePack) : false);
	const wholePackDisabled = $derived(opened.data ? packDisabled?.(opened.data.pack) : undefined);

	const packSkills = $derived(
		(opened.data?.skills ?? []).map((skill) => ({ ...skill, id: skill.entry }))
	);

	const asSource = (skill: { entry: string; name: string; description?: string }): Picked => ({
		kind: 'source',
		entry: skill.entry,
		skill: { name: skill.name, description: skill.description }
	});

	/* ------------------------------------------------------------ repos */

	let query = $state('');

	/** `owner/`, or `owner/par`: whose public repos to list, since they are not in your cache. */
	const typedOwner = $derived(
		/^(?:https?:\/\/)?(?:github\.com\/)?([a-z\d][a-z\d-]{0,38})\/[\w.-]*$/i
			.exec(query.trim())?.[1]
			?.toLowerCase() ?? null
	);

	type OwnerRepos = FunctionReturnType<typeof api.github.ownerRepos>;

	/** Owners' public repos as GitHub listed them, or `null` while that lookup is out. */
	let owners = $state<Record<string, OwnerRepos | null>>({});

	/** Owners' repos GitHub says have no SKILL.md, known before they are listed. */
	const searchedEmpty = $derived(
		new Set(
			Object.values(owners).flatMap((found) =>
				(found?.repos ?? []).filter((repo) => repo.hasSkills === false).map((repo) => repo.key)
			)
		)
	);
	const ownerLoading = $derived(typedOwner !== null && owners[typedOwner] === null);

	function lookUpOwner(owner: string) {
		if (owner in owners) return;
		owners[owner] = null;
		client
			.action(api.github.ownerRepos, { owner })
			.catch(() => ({ repos: [] }))
			.then((found) => {
				owners[owner] = found;
			});
	}

	/**
	 * Your repos, plus any already picked from (which need not be yours) and
	 * whatever `owner/repo` was typed, since any public repo will do. Picked ones
	 * come first.
	 */
	const repoRows = $derived.by(() => {
		const row = (key: string, description?: string | null) => {
			const parts = projectParts(key);
			return {
				key,
				parts,
				name: parts.path,
				shortName: parts.name,
				description: description ?? undefined
			};
		};

		const ownerRows = (typedOwner ? (owners[typedOwner]?.repos ?? []) : []).map((repo) =>
			row(repo.key, repo.description)
		);
		const yours = repos.merge([]).map((repo) => row(repo.key, repo.description));
		const yourKeys = new Set(yours.map((r) => r.key));
		const cached = [...yours, ...ownerRows.filter((r) => !yourKeys.has(r.key))];
		const known = new Set(cached.map((r) => r.key));
		const all = [
			...Object.keys(chosen)
				.filter((key) => !known.has(key))
				.map((key) => row(key)),
			...cached
		];

		const rows = search(all, query.trim().replace(/^(https?:\/\/)?github\.com\//i, ''));
		const typed = typedRepoKey(query);
		// a guess at the full name, unless the owner's own list already turned up a match for it
		const ownerMatched =
			ownerRows.length > 0 && rows.some((r) => ownerRows.some((o) => o.key === r.key));
		if (typed && !ownerMatched && !rows.some((r) => r.key === typed)) rows.unshift(row(typed));

		return [...rows.filter((r) => r.key in chosen), ...rows.filter((r) => !(r.key in chosen))];
	});

	/** Only the first screenful is scanned for skill counts; GitHub is asked as little as it can be. */
	const SCANNED = 20;
	/** Most repos scanned in one sitting, however many turn out to have no skills. */
	const MAX_REQUESTED = 120;

	/** Every repo asked about so far, so hidden ones keep the scan that hid them. */
	let requested = $state<string[]>([]);
	const selectedKey = $derived(step.name === 'repo' ? step.key : null);

	const scans = useQuery(api.scans.forKeys, () =>
		step.name === 'repos' || step.name === 'repo'
			? { keys: [...requested, ...(selectedKey ? [selectedKey] : [])] }
			: 'skip'
	);
	const scanFor = (key: string) => scans.data?.find((scan) => scan.key === key);

	/** Scanned and found nothing to add. Hidden unless asked for, or already picked from. */
	/**
	 * Repos a scan had already found empty when the list was last laid out. A
	 * scan landing while you look only fills in its count: hiding the row then
	 * would pull the ones below up under your cursor, scan them, and go again.
	 */
	let settledEmpty = $state<string[]>([]);

	function settle() {
		untrack(() => {
			settledEmpty = (scans.data ?? [])
				.filter((scan) => scan.found && scan.skills.length === 0)
				.map((scan) => scan.key);
		});
	}

	/** Known to have no skills from what was there when the list was laid out, so rows never vanish mid-look. */
	const isEmpty = (key: string) => {
		if (key in chosen) return false;
		if (settledEmpty.includes(key)) return true;
		const scanned = scanFor(key);
		if (scanned?.found && scanned.skills.length > 0) return false;
		return repos.hasSkills(key) === false || searchedEmpty.has(key);
	};

	let showEmpty = $state(false);
	const emptyRows = $derived(repoRows.filter((row) => isEmpty(row.key)));
	const hiddenCount = $derived(emptyRows.length);
	/** Shown, the empty ones go below the rest rather than in among them, so nobody loses their place. */
	const withSkills = $derived(repoRows.filter((row) => !isEmpty(row.key)));
	const shownRows = $derived(showEmpty ? [...withSkills, ...emptyRows] : withSkills);

	/** Where the picked group ends, for its heading and the one after. */
	const chosenCount = $derived(shownRows.filter((r) => r.key in chosen).length);

	const visibleKeys = $derived(shownRows.slice(0, SCANNED).map((row) => row.key));

	function scan(keys: string[]) {
		// best effort: a row without a count is still a row
		if (keys.length > 0) client.action(api.scans.scan, { keys }).catch(() => {});
	}

	let queued: string[] = [];
	let queueTimer: ReturnType<typeof setTimeout> | undefined;

	/**
	 * Asks for a row's skill count once it is among the first screenful. Batched,
	 * and only once typing settles, so a half typed name is never looked up; as
	 * empty repos drop out, the rows moving up are asked about in turn.
	 */
	function queueScan(key: string) {
		// already known to have none: nothing a scan would add
		if (isEmpty(key)) return;
		if (requested.includes(key) || queued.includes(key)) return;
		queued.push(key);
		clearTimeout(queueTimer);
		queueTimer = setTimeout(() => {
			const room = MAX_REQUESTED - requested.length;
			const keys = queued.filter((k) => visibleKeys.includes(k)).slice(0, Math.max(0, room));
			queued = [];
			if (keys.length === 0) return;
			requested = [...requested, ...keys];
			scan(keys);
		}, 400);
	}

	/** On the rows of the first screenful: scans them as they come into it. */
	const scanWhenVisible = (key: string, index: number) => () => {
		if (index < SCANNED) untrack(() => queueScan(key));
	};

	let searchTimer: ReturnType<typeof setTimeout> | undefined;

	function onSearch(value: string) {
		query = value;
		// the list is laid out afresh for the new search anyway
		settle();
		repos.search(value);
		clearTimeout(searchTimer);
		// once typing settles, look up what is on screen
		searchTimer = setTimeout(() => {
			if (typedOwner) lookUpOwner(typedOwner);
		}, 400);
	}

	/** Fills the repo list as it comes on screen, whether it opened there or was stepped into. */
	function loadRepos() {
		// once per showing: the cache and the rows it reads would otherwise run it again on every change
		untrack(() => repos.open());
		settle();
	}

	function toRepo(key: string) {
		step = { name: 'repo', key };
		scan([key]);
	}

	/* ------------------------------------------------------------- repo */

	const current = $derived(selectedKey ? scanFor(selectedKey) : undefined);
	const currentParts = $derived(selectedKey ? projectParts(selectedKey) : null);
	const wholeRepo = $derived<Picked | null>(
		selectedKey
			? { kind: 'repo', key: selectedKey, dir: null, description: current?.description }
			: null
	);
	const wholeIncluded = $derived(wholeRepo ? isIncluded(wholeRepo) : false);
	/** Every skill in the repo is already there, so there is nothing left to take. */
	const wholeTaken = $derived(
		selectedKey !== null &&
			repoTaken !== undefined &&
			(current?.skills.length ?? 0) > 0 &&
			current!.skills.every((skill) => repoTaken(selectedKey!, skill.dir) !== undefined)
	);

	const repoSkills = $derived(
		(current?.skills ?? []).map((skill) => ({
			id: skill.dir || '.',
			dir: skill.dir,
			name: skill.name,
			description: skill.description,
			sole: skill.sole
		}))
	);

	const description = $derived(
		{
			choose: 'Where would you like to add skills from?',
			mine: 'Pick skills from your personal library.',
			packs: 'Pick one of your packs, or paste the link to anyone’s.',
			pack: opened.data?.pack.description ?? 'Pick skills from this pack.',
			repos: 'Pick a repository, or type owner/ to see anyone’s public ones.',
			repo: current?.description ?? 'Pick skills from this repository.'
		}[step.name]
	);

	const title = $derived(
		{
			choose: 'Add skills',
			mine: first.name === 'mine' ? 'Add skills' : 'Your skills',
			packs: 'From a pack',
			pack: opened.data?.pack.name ?? 'From a pack',
			repos: 'From GitHub',
			repo: currentParts?.path ?? 'From GitHub'
		}[step.name]
	);
</script>

<Modal.Root
	bind:open
	onOpenChangeComplete={(isOpen) => {
		if (isOpen) return;
		// each opening starts afresh: no search left over from last time
		step = first;
		query = '';
		address = '';
		clearTimeout(searchTimer);
		// the scan cap is per sitting
		requested = [];
		showEmpty = false;
		settledEmpty = [];
	}}
>
	<Modal.Content class="flex max-h-[85dvh] flex-col gap-0 sm:max-w-lg">
		<Modal.Header class="flex-row items-center gap-2">
			{#if step.name !== first.name}
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label="Back"
					class="-ml-1.5"
					onclick={() =>
						(step =
							step.name === 'repo'
								? { name: 'repos' }
								: step.name === 'pack'
									? { name: 'packs' }
									: first)}
				>
					<RiArrowLeftLine />
				</Button>
			{/if}
			<Modal.Title class="truncate">{title}</Modal.Title>
		</Modal.Header>
		<Modal.Description class="text-left">{description}</Modal.Description>

		<div class="flex min-h-0 flex-col pt-4">
			{#if step.name === 'choose'}
				<div class="flex flex-col gap-2">
					{#if skills}
						<button
							type="button"
							onclick={() => (step = { name: 'mine' })}
							class="flex items-center gap-3.5 rounded-lg border border-border px-4 py-3.5 text-left transition-colors hover:bg-accent"
						>
							<Avatar seed={user?.seed ?? ''} src={user?.image ?? null} size={32} />
							<span class="flex min-w-0 flex-1 flex-col gap-0.5">
								<span class="flex items-center gap-1.5 text-sm font-medium text-card-foreground">
									Add my own skills
									<span class="text-xs font-normal text-muted-foreground">{own.length}</span>
								</span>
								<span class="text-[13px] text-muted-foreground">From your personal library.</span>
							</span>
							<RiArrowRightSLine class="size-4 text-muted-foreground" aria-hidden="true" />
						</button>
					{/if}

					{#if github}
						<button
							type="button"
							onclick={() => (step = { name: 'repos' })}
							class="flex items-center gap-3.5 rounded-lg border border-border px-4 py-3.5 text-left transition-colors hover:bg-accent"
						>
							<span class="flex size-8 shrink-0 items-center justify-center">
								<GithubLogo class="size-6" />
							</span>
							<span class="flex min-w-0 flex-1 flex-col gap-0.5">
								<span class="text-sm font-medium text-card-foreground">Add from GitHub</span>
								<span class="text-[13px] text-muted-foreground"
									>Skills from any GitHub repository.</span
								>
							</span>
							<RiArrowRightSLine class="size-4 text-muted-foreground" aria-hidden="true" />
						</button>
					{/if}

					{#if packs}
						<button
							type="button"
							onclick={() => (step = { name: 'packs' })}
							class="flex items-center gap-3.5 rounded-lg border border-border px-4 py-3.5 text-left transition-colors hover:bg-accent"
						>
							<span class="flex size-8 shrink-0 items-center justify-center text-muted-foreground">
								<RiStackLine class="size-6" aria-hidden="true" />
							</span>
							<span class="flex min-w-0 flex-1 flex-col gap-0.5">
								<span class="text-sm font-medium text-card-foreground">Add from a pack</span>
								<span class="text-[13px] text-muted-foreground">
									Every skill in a pack, or just some of them.
								</span>
							</span>
							<RiArrowRightSLine class="size-4 text-muted-foreground" aria-hidden="true" />
						</button>
					{/if}
				</div>
			{:else if step.name === 'mine'}
				<SkillChecklist
					items={own}
					isChecked={(skill) => isIncluded({ kind: 'own', skill })}
					disabled={(skill) => ownDisabled?.(skill)}
					onToggle={(skill, checked) => onToggle({ kind: 'own', skill }, checked)}
				>
					{#snippet badge(skill)}
						{#if sharing && !skill.public}
							<RiLockLine class="size-3.5 shrink-0 text-muted-foreground" aria-label="Private" />
						{/if}
					{/snippet}
				</SkillChecklist>
			{:else if step.name === 'packs'}
				<form class="mb-3 flex items-center gap-2" onsubmit={openAddress}>
					<Input
						bind:value={address}
						placeholder="Paste a pack link"
						aria-label="A pack's link"
						autocomplete="off"
						spellcheck="false"
						class="h-9 min-w-0 flex-1 font-mono text-[13px]"
					/>
					<Button type="submit" variant="outline" disabled={!address.trim()}>Open</Button>
				</form>

				<div
					class="-mx-1 -mb-4 flex max-h-[min(26rem,55dvh)] min-h-0 scroll-fade-y flex-col gap-1.5 overflow-y-auto px-1 pb-4"
				>
					{#each packs ?? [] as pack (pack.slug)}
						<button
							type="button"
							onclick={() =>
								(step = { name: 'pack', username: page.data.username ?? '', slug: pack.slug })}
							class="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-left transition-colors hover:bg-accent"
						>
							<Avatar seed={user?.seed ?? pack.name} src={user?.image ?? null} size={32} />
							<span class="flex min-w-0 flex-1 flex-col gap-0.5">
								<span class="flex min-w-0 items-center gap-2">
									<span class="truncate text-[13px] font-semibold text-card-foreground">
										{pack.name}
									</span>
									{#if !pack.public}
										<RiLockLine
											class="size-3.5 shrink-0 text-muted-foreground"
											aria-label="Private"
										/>
									{/if}
									<span class="shrink-0 text-xs text-muted-foreground">{packCount(pack)}</span>
									{#if isIncluded( { kind: 'pack', pack: { ...pack, username: page.data.username ?? '' } } )}
										<span
											class="ml-auto shrink-0 rounded-full bg-primary px-1.5 py-px text-[11px] font-medium text-primary-foreground"
										>
											All skills
										</span>
									{/if}
								</span>
								<span class="truncate text-xs text-muted-foreground">
									{pack.description ?? 'No description'}
								</span>
							</span>
						</button>
					{:else}
						<p class="px-2 py-8 text-center text-xs text-muted-foreground">
							You have no other packs. Paste the link to anyone’s.
						</p>
					{/each}
				</div>
			{:else if step.name === 'pack'}
				{#if opened.isLoading}
					<div class="flex flex-col gap-2" aria-busy="true" aria-label="Looking for skills">
						{#each { length: 4 } as _, i (i)}
							<Skeleton class="h-10 w-full" />
						{/each}
					</div>
				{:else if !opened.data}
					<p class="px-2 py-8 text-center text-sm text-muted-foreground">
						Couldn't open this pack. It may be private, or deleted.
					</p>
				{:else if opened.data.skills.length === 0}
					<p class="px-2 py-8 text-center text-sm text-muted-foreground">
						No skills in this pack that you can see.
					</p>
				{:else}
					<!-- the whole pack is its own entry: it follows the pack, so new skills come too -->
					<button
						type="button"
						role="checkbox"
						aria-checked={wholePackIncluded}
						disabled={wholePackDisabled !== undefined && !wholePackIncluded}
						onclick={() => wholePack && onToggle(wholePack, !wholePackIncluded)}
						class="mb-2 flex w-full items-start gap-2.5 rounded-lg border border-border px-3 py-2.5 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent disabled:opacity-60 disabled:hover:bg-transparent"
					>
						<span
							class="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors {wholePackIncluded
								? 'border-primary bg-primary text-primary-foreground'
								: 'border-input'}"
						>
							{#if wholePackIncluded}<RiCheckLine class="size-3" aria-hidden="true" />{/if}
						</span>
						<span class="flex min-w-0 flex-col gap-0.5">
							<span class="font-medium text-card-foreground">Every skill in this pack</span>
							<span class="text-xs text-muted-foreground">
								{#if wholePackDisabled && !wholePackIncluded}
									{wholePackDisabled}. Its skills can still be picked one by one.
								{:else}
									All {opened.data.skills.length}, and any it gains later.
								{/if}
							</span>
						</span>
					</button>

					<SkillChecklist
						items={packSkills}
						isChecked={(skill) => wholePackIncluded || isIncluded(asSource(skill))}
						disabled={() => (wholePackIncluded ? 'Included with the whole pack' : undefined)}
						onToggle={(skill, checked) => onToggle(asSource(skill), checked)}
					>
						{#snippet badge(skill)}
							{#if skill.unscanned}
								<span class="shrink-0 text-xs text-muted-foreground">whole repository</span>
							{/if}
						{/snippet}
					</SkillChecklist>
				{/if}
			{:else if step.name === 'repos'}
				<SearchInput
					{@attach loadRepos}
					placeholder="Search repos, or owner/repo"
					aria-label="Search repos"
					class="h-9"
					bind:value={() => query, onSearch}
				/>

				<div
					class="-mx-1 mt-2 -mb-4 flex max-h-[min(26rem,55dvh)] min-h-0 scroll-fade-y flex-col gap-1.5 overflow-y-auto px-1 pb-4"
				>
					{#each shownRows as row, i (row.key)}
						{@const scanned = scanFor(row.key)}
						{@const picked = chosen[row.key]}
						{#if chosenCount > 0 && (i === 0 || i === chosenCount)}
							<p class="px-1 pt-1 text-xs font-medium text-muted-foreground {i > 0 ? 'mt-2' : ''}">
								{i === 0 ? chosenHeading : 'Repositories'}
							</p>
						{/if}
						{#if showEmpty && i === withSkills.length}
							<p class="mt-2 px-1 pt-1 text-xs font-medium text-muted-foreground">No skills</p>
						{/if}
						<button
							type="button"
							{@attach scanWhenVisible(row.key, i)}
							onclick={() => toRepo(row.key)}
							class="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-left transition-colors hover:bg-accent"
						>
							<ProjectIcon parts={row.parts} size="md" />
							<span class="flex min-w-0 flex-1 flex-col gap-0.5">
								<span class="flex min-w-0 items-center gap-2">
									<span class="truncate text-sm font-semibold text-card-foreground">
										{row.parts.path}
									</span>
									{#if scanned?.found}
										<span class="shrink-0 text-xs text-muted-foreground">
											{scanned.skills.length}
											{scanned.skills.length === 1 ? 'skill' : 'skills'}
										</span>
									{:else if scanned}
										<span class="shrink-0 text-xs text-muted-foreground">not found</span>
									{:else if isEmpty(row.key)}
										<!-- known from GitHub's search, without a scan of its own -->
										<span class="shrink-0 text-xs text-muted-foreground">0 skills</span>
									{/if}
									{#if picked !== undefined}
										<span
											class="ml-auto shrink-0 rounded-full bg-primary px-1.5 py-px text-[11px] font-medium text-primary-foreground"
										>
											{chosenLabel
												? chosenLabel(row.key)
												: picked === 'all'
													? 'All skills'
													: `${picked} selected`}
										</span>
									{/if}
								</span>
								<span class="truncate text-xs text-muted-foreground">
									{scanned?.description ?? row.description ?? 'No description'}
								</span>
							</span>
						</button>
					{:else}
						<p class="px-2 py-8 text-center text-xs text-muted-foreground">
							{#if ownerLoading}
								Looking up {typedOwner}’s repositories…
							{:else if hiddenCount > 0}
								None of {hiddenCount === 1
									? 'the repositories'
									: `these ${hiddenCount} repositories`}
								have skills.
							{:else if repos.syncing}
								Looking up your repositories…
							{:else if typedOwner}
								No public repositories match.
							{:else if query.trim()}
								No repositories match. Type <code class="font-mono">owner/</code> to see anyone’s public
								ones.
							{:else}
								Type <code class="font-mono">owner/</code> to see anyone’s public repositories.
							{/if}
						</p>
					{/each}

					{#if hiddenCount > 0}
						<div
							class="flex items-center justify-between gap-2 px-1 pt-1 text-xs text-muted-foreground"
						>
							<span>
								{#if showEmpty}
									Showing {hiddenCount}
									{hiddenCount === 1 ? 'repository' : 'repositories'} with no skills
								{:else}
									+{hiddenCount}
									{hiddenCount === 1 ? 'repository' : 'repositories'} hidden since
									{hiddenCount === 1 ? 'it has' : 'they have'} no skills
								{/if}
							</span>
							<Button variant="ghost" size="xs" onclick={() => (showEmpty = !showEmpty)}>
								{showEmpty ? 'Hide' : 'Show'}
							</Button>
						</div>
					{/if}
				</div>
			{:else if step.name === 'repo'}
				{#if !current}
					<div class="flex flex-col gap-2" aria-busy="true" aria-label="Looking for skills">
						{#each { length: 4 } as _, i (i)}
							<Skeleton class="h-10 w-full" />
						{/each}
					</div>
				{:else if !current.found}
					<p class="px-2 py-8 text-center text-sm text-muted-foreground">
						Couldn't reach this repository. It may be private and not shared with skilless.
					</p>
				{:else if current.skills.length === 0}
					<p class="px-2 py-8 text-center text-sm text-muted-foreground">
						No skills in this repository.
					</p>
				{:else}
					<!-- the whole repo is its own entry: it follows the repo, so new skills come too -->
					<button
						type="button"
						role="checkbox"
						aria-checked={wholeIncluded || wholeTaken}
						disabled={wholeTaken}
						title={wholeTaken ? repoTaken?.(selectedKey!, current.skills[0]!.dir) : undefined}
						onclick={() => wholeRepo && onToggle(wholeRepo, !wholeIncluded)}
						class="mb-2 flex w-full items-start gap-2.5 rounded-lg border border-border px-3 py-2.5 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent disabled:pointer-events-none"
					>
						<span
							class="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors {wholeTaken
								? 'border-input bg-muted text-muted-foreground'
								: wholeIncluded
									? 'border-primary bg-primary text-primary-foreground'
									: 'border-input'}"
						>
							{#if wholeIncluded || wholeTaken}<RiCheckLine
									class="size-3"
									aria-hidden="true"
								/>{/if}
						</span>
						<span class="flex min-w-0 flex-col gap-0.5">
							<span class="font-medium text-card-foreground">Every skill in this repository</span>
							<span class="text-xs text-muted-foreground">
								{#if followsRepo}
									All {current.skills.length}, and any added later.
								{:else}
									{current.skills.length}
									{current.skills.length === 1 ? 'skill' : 'skills'}, as they are now.
								{/if}
							</span>
						</span>
					</button>

					<SkillChecklist
						items={repoSkills}
						isChecked={(skill) =>
							wholeIncluded ||
							repoTaken?.(selectedKey!, skill.dir) !== undefined ||
							isIncluded({ kind: 'repo', key: selectedKey!, dir: skill.dir, skill })}
						disabled={(skill) =>
							repoTaken?.(selectedKey!, skill.dir) ??
							(wholeIncluded ? 'Included with the whole repository' : undefined)}
						onToggle={(skill, checked) =>
							onToggle({ kind: 'repo', key: selectedKey!, dir: skill.dir, skill }, checked)}
					/>
				{/if}
			{/if}
		</div>

		<!-- only where skills are ticked; the steps before only lead somewhere -->
		{#if step.name === 'mine' || step.name === 'pack' || step.name === 'repo' || (footer && (step.name === 'repos' || step.name === 'packs'))}
			<Modal.Footer class="pt-4">
				{#if footer}
					{@render footer()}
				{:else}
					<Button onclick={() => (open = false)}>Done</Button>
				{/if}
			</Modal.Footer>
		{/if}
	</Modal.Content>
</Modal.Root>
