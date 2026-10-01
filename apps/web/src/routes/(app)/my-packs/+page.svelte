<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { APP_NAME } from '$lib/constants';
	import { cliAddress, skillCount } from '$lib/pack';
	import { search, terms } from '$lib/search';
	import { submitAction } from '$lib/submit';
	import { copyText } from '$lib/hooks/use-clipboard.svelte';
	import { confirmDelete } from '$lib/components/ui/confirm-delete-dialog';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as Modal from '$lib/components/ui/modal';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { LoadingButton } from '$lib/components/ui/loading-button';
	import { Textarea } from '$lib/components/ui/textarea';
	import ListToolbar from '$lib/components/app/list-toolbar.svelte';
	import Avatar from '$lib/components/app/avatar.svelte';
	import ListRow from '$lib/components/app/list-row.svelte';
	import SelectSearch from '$lib/components/app/select-search.svelte';
	import { UseSelection } from '$lib/hooks/use-selection.svelte';
	import { collapseX } from '$lib/transitions';
	import { toast } from 'svelte-sonner';
	import RiAddLine from 'remixicon-svelte/icons/add-line';
	import RiDeleteBinLine from 'remixicon-svelte/icons/delete-bin-line';
	import RiExternalLinkLine from 'remixicon-svelte/icons/external-link-line';
	import RiFileCopyLine from 'remixicon-svelte/icons/file-copy-line';
	import RiGlobalLine from 'remixicon-svelte/icons/global-line';
	import RiLockLine from 'remixicon-svelte/icons/lock-line';
	import RiMoreFill from 'remixicon-svelte/icons/more-fill';

	let { data, form } = $props();

	// live subscription seeded with the server's data (see hooks.ts)
	const packs = $derived(data.packs.data ?? []);

	type Pack = (typeof packs)[number];

	let query = $state('');
	const queryTerms = $derived(terms(query));
	const results = $derived(search(packs, query));

	let open = $state(false);
	let creating = $state(false);

	/** Checked rows; actions only reach the ones on screen. */
	const selection = new UseSelection(
		() => results,
		(pack) => pack._id
	);
	const selected = $derived(selection.selected);

	const count = (n: number) => `${n} ${n === 1 ? 'pack' : 'packs'}`;
	/** "Make public" when it covers the whole selection (or none of it); "Make 2 public" when only some qualify. */
	const only = (eligible: Pack[], rest: string) =>
		eligible.length === 0 || eligible.length === selected.length
			? `Make ${rest}`
			: `Make ${eligible.length} ${rest}`;
	const publicable = $derived(selected.filter((pack) => !pack.public));
	const privatable = $derived(selected.filter((pack) => pack.public));

	/** A request each; reports what did not go. Live queries carry the change, so nothing to invalidate. */
	async function each(
		packs: Pack[],
		action: string,
		fields: (pack: Pack) => Record<string, string>
	) {
		const results = await Promise.all(
			packs.map((pack) =>
				submitAction(`/my-packs?/${action}`, fields(pack), {
					keepFocus: true,
					invalidate: false
				}).catch(() => null)
			)
		);
		return results.filter((result) => result?.type !== 'success').length;
	}

	async function setPublic(packs: Pack[], value: boolean) {
		const failed = await each(packs, 'setPublic', (pack) => ({
			slug: pack.slug,
			public: String(value)
		}));
		if (failed > 0) toast.error(`Could not update ${failed} of ${count(packs.length)}`);
	}

	function removeSelected() {
		const doomed = [...selected];
		if (doomed.length === 1) return remove(doomed[0]);
		confirmDelete({
			title: `Delete ${count(doomed.length)}?`,
			description:
				'Anyone who added them keeps their skills, but can no longer get updates from them. This cannot be undone.',
			confirm: { text: `Delete ${doomed.length}` },
			onConfirm: async () => {
				const failed = await each(doomed, 'remove', (pack) => ({ slug: pack.slug }));
				if (failed > 0) toast.error(`Could not delete ${failed} of ${count(doomed.length)}`);
				selection.clear(doomed);
			}
		});
	}

	async function copyAdd(pack: Pack) {
		const username = page.data.username as string | null;
		if (!username) {
			toast.error('Your username is not known yet. Try again in a moment.');
			return;
		}
		const command = `skilless add ${cliAddress({ kind: 'pack', username, slug: pack.slug })}`;
		if ((await copyText(command)) === 'success') toast.success('Copied add command');
		else toast.error('Could not copy to the clipboard');
	}

	function remove(pack: Pack) {
		confirmDelete({
			title: `Delete ${pack.name}?`,
			description:
				'Anyone who added it keeps its skills, but can no longer get updates from it. This cannot be undone.',
			onConfirm: async () => {
				const result = await submitAction(
					'/my-packs?/remove',
					{ slug: pack.slug },
					{ keepFocus: true, invalidate: false }
				);
				if (result.type !== 'success') toast.error(`Could not delete ${pack.name}`);
				else selection.set(pack, false);
			}
		});
	}
</script>

<svelte:head><title>Packs · {APP_NAME}</title></svelte:head>

{#if packs.length === 0}
	<div class="flex flex-col items-center justify-center gap-2 px-8 py-24 text-center">
		<p class="text-sm text-card-foreground">No packs yet</p>
		<p class="max-w-sm text-sm text-muted-foreground">
			A pack is a list of skills from anywhere, added in one go with
			<code class="font-mono text-foreground">skilless add &lt;pack&gt;</code>.
		</p>
		<Button size="sm" class="mt-4" onclick={() => (open = true)}>
			<RiAddLine />
			Create
		</Button>
	</div>
{:else}
	<ListToolbar>
		<SelectSearch
			checked={selection.all}
			indeterminate={selection.some}
			onCheckedChange={(checked) => selection.setAll(checked)}
			selectLabel="Select all shown packs"
			placeholder="Search packs"
			label="Search packs"
			class="flex-1"
			bind:value={query}
		/>

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

							<!-- disabled rather than hidden when nothing qualifies, so the menu does not reshuffle -->
							<DropdownMenu.Group>
								<DropdownMenu.Item
									disabled={publicable.length === 0}
									onSelect={() => setPublic(publicable, true)}
								>
									<RiGlobalLine />
									{only(publicable, 'public')}
								</DropdownMenu.Item>
								<DropdownMenu.Item
									disabled={privatable.length === 0}
									onSelect={() => setPublic(privatable, false)}
								>
									<RiLockLine />
									{only(privatable, 'private')}
								</DropdownMenu.Item>
							</DropdownMenu.Group>

							<DropdownMenu.Separator />

							<DropdownMenu.Item variant="destructive" onSelect={removeSelected}>
								<RiDeleteBinLine />
								Delete {count(selected.length)}
							</DropdownMenu.Item>
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				</div>
			{/if}
		</div>
	</ListToolbar>

	{#if results.length === 0}
		<p class="px-6 py-16 text-center text-sm text-muted-foreground">
			No packs match “{query.trim()}”.
		</p>
	{/if}

	<ul class="divide-y divide-border [&>li:first-child]:pt-2">
		{#each results as pack (pack._id)}
			<ListRow
				title={pack.name}
				href="/my-packs/{pack.slug}"
				terms={queryTerms}
				description={pack.description}
				selected={selection.has(pack)}
				onSelectedChange={(checked) => selection.set(pack, checked)}
			>
				{#snippet leading()}
					<Avatar seed={data.user.seed} src={data.user.image} size={32} />
				{/snippet}
				{#snippet meta()}
					<span class="inline-flex shrink-0" title={pack.public ? 'Public' : 'Private'}>
						{#if pack.public}
							<RiGlobalLine class="size-3.5 text-muted-foreground" aria-hidden="true" />
						{:else}
							<RiLockLine class="size-3.5 text-muted-foreground" aria-hidden="true" />
						{/if}
					</span>
					<span class="sr-only">{pack.public ? 'Public' : 'Private'}</span>
					<span class="shrink-0 text-xs text-muted-foreground">{skillCount(pack)}</span>
				{/snippet}
				{#snippet actions()}
					<DropdownMenu.Root>
						<DropdownMenu.Trigger>
							{#snippet child({ props })}
								<Button
									{...props}
									variant="ghost"
									size="icon-sm"
									aria-label="Actions for {pack.name}"
								>
									<RiMoreFill class="text-muted-foreground" />
								</Button>
							{/snippet}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="end">
							<DropdownMenu.Item onSelect={() => copyAdd(pack)}>
								<RiFileCopyLine />
								Copy add command
							</DropdownMenu.Item>
							<DropdownMenu.Item>
								{#snippet child({ props })}
									<a {...props} href="/packs/{page.data.username}/{pack.slug}">
										<RiExternalLinkLine />
										View page
									</a>
								{/snippet}
							</DropdownMenu.Item>
							<DropdownMenu.Separator />
							<DropdownMenu.Item variant="destructive" onSelect={() => remove(pack)}>
								<RiDeleteBinLine />
								Delete
							</DropdownMenu.Item>
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				{/snippet}
			</ListRow>
		{/each}
	</ul>
{/if}

<Modal.Root bind:open>
	<Modal.Content class="sm:max-w-md">
		<form
			method="POST"
			action="?/create"
			use:enhance={() => {
				creating = true;
				return async ({ update }) => {
					// a success redirects into the pack; only failures come back here
					await update({ reset: false });
					creating = false;
				};
			}}
		>
			<Modal.Header>
				<Modal.Title>Create a pack</Modal.Title>
				<Modal.Description>
					Name it, then add skills from your library or any repository.
				</Modal.Description>
			</Modal.Header>

			<div class="flex flex-col gap-5 py-6">
				<div class="flex flex-col gap-2">
					<Label for="pack-name">Name</Label>
					<Input
						id="pack-name"
						name="name"
						placeholder="Pack name"
						autocomplete="off"
						value={form?.name ?? ''}
					/>
				</div>

				<div class="flex flex-col gap-2">
					<Label for="pack-description">Description</Label>
					<Textarea
						id="pack-description"
						name="description"
						rows={3}
						placeholder="What is it for? Optional."
						value={form?.description ?? ''}
					/>
				</div>

				{#if form?.message}
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
