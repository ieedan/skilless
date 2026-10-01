<script lang="ts">
	import { enhance } from '$app/forms';
	import { APP_NAME } from '$lib/constants';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import RiAddLine from 'remixicon-svelte/icons/add-line';
	import RiDeleteBinLine from 'remixicon-svelte/icons/delete-bin-line';
	import RiMoreFill from 'remixicon-svelte/icons/more-fill';
	import { LoadingButton } from '$lib/components/ui/loading-button';
	import { CopyButton } from '$lib/components/ui/copy-button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Modal from '$lib/components/ui/modal';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as Tabs from '$lib/components/ui/tabs';
	import { confirmDelete } from '$lib/components/ui/confirm-delete-dialog';
	import Highlighted from '$lib/components/app/highlighted.svelte';
	import RowCheckbox from '$lib/components/app/row-checkbox.svelte';
	import SelectSearch from '$lib/components/app/select-search.svelte';
	import { UseSelection } from '$lib/hooks/use-selection.svelte';
	import { search, terms } from '$lib/search';
	import { submitAction } from '$lib/submit';
	import { collapseX } from '$lib/transitions';
	import { toast } from 'svelte-sonner';

	let { data } = $props();

	const tokens = $derived(data.tokens.data ?? []);

	type Token = (typeof tokens)[number];

	let query = $state('');
	const queryTerms = $derived(terms(query));
	let kind = $state<'all' | 'cli' | 'mcp'>('all');
	const results = $derived(
		search(
			tokens.filter((token) => kind === 'all' || (token.kind === 'mcp') === (kind === 'mcp')),
			query
		)
	);

	/** Checked rows; actions only reach the ones on screen, and a revoked one just drops out. */
	const selection = new UseSelection(
		() => results,
		(token) => token._id
	);
	const selected = $derived(selection.selected);

	const count = (n: number) => `${n} ${n === 1 ? 'token' : 'tokens'}`;

	function revoke(revoked: Token[]) {
		const one = revoked.length === 1;
		confirmDelete({
			title: one ? `Revoke ${revoked[0].name}?` : `Revoke ${count(revoked.length)}?`,
			description: one
				? 'Anything using it loses access straight away. This cannot be undone.'
				: 'Anything using them loses access straight away. This cannot be undone.',
			confirm: { text: one ? 'Revoke' : `Revoke ${revoked.length}` },
			onConfirm: async () => {
				// fed by a live query, so there is nothing to invalidate
				const results = await Promise.all(
					revoked.map((token) =>
						submitAction(
							'/settings?/revoke',
							{ tokenId: token._id },
							{ keepFocus: true, invalidate: false }
						).catch(() => null)
					)
				);
				const failed = results.filter((result) => result?.type !== 'success').length;
				if (failed > 0) {
					toast.error(
						one
							? `Could not revoke ${revoked[0].name}`
							: `Could not revoke ${failed} of ${count(revoked.length)}`
					);
				}
			}
		});
	}

	let open = $state(false);
	let creating = $state(false);

	// The plaintext is shown once and never stored. It lives here rather than in
	// `form` so that closing the dialog forgets it for good: `form` survives a
	// close, and reopening would show the same token again.
	let minted = $state<string>();

	function day(ms: number) {
		return new Date(ms).toLocaleDateString('en-GB', {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}
</script>

<svelte:head><title>Settings · {APP_NAME}</title></svelte:head>

<div class="flex flex-col gap-6 pt-4">
	<!-- the only section so far; later settings get their own, each headed like this one -->
	<section class="flex flex-col gap-4" aria-labelledby="tokens-heading">
		<div class="flex flex-col gap-1.5">
			<h2 id="tokens-heading" class="text-base font-semibold text-card-foreground">Tokens</h2>
			<p class="text-[13px] text-muted-foreground">
				Tokens let the CLI, cloud agents and MCP clients access your library. Apps you connect over
				MCP are listed here too.
			</p>
		</div>

		<div class="flex flex-col">
			<div class="mb-2 flex items-center gap-2">
				{#if tokens.length > 0}
					<SelectSearch
						checked={selection.all}
						indeterminate={selection.some}
						onCheckedChange={(checked) => selection.setAll(checked)}
						selectLabel="Select all shown tokens"
						placeholder="Search tokens"
						label="Search tokens"
						class="flex-1"
						bind:value={query}
					/>

					<Tabs.Root
						bind:value={() => kind, (value) => (kind = value as typeof kind)}
						class="max-sm:hidden"
					>
						<Tabs.List>
							<Tabs.Trigger value="all">All</Tabs.Trigger>
							<Tabs.Trigger value="cli">CLI</Tabs.Trigger>
							<Tabs.Trigger value="mcp">MCP</Tabs.Trigger>
						</Tabs.List>
					</Tabs.Root>
				{:else}
					<div class="flex-1"></div>
				{/if}

				<div class="flex shrink-0 items-center gap-2">
					<Button size="sm" onclick={() => (open = true)}>
						<RiAddLine />
						Create token
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
									<DropdownMenu.Item variant="destructive" onSelect={() => revoke([...selected])}>
										<RiDeleteBinLine />
										Revoke {count(selected.length)}
									</DropdownMenu.Item>
								</DropdownMenu.Content>
							</DropdownMenu.Root>
						</div>
					{/if}
				</div>
			</div>

			{#if tokens.length === 0}
				<p class="px-6 py-16 text-center text-sm text-muted-foreground">No tokens yet.</p>
			{:else if results.length === 0}
				<p class="px-6 py-16 text-center text-sm text-muted-foreground">
					{#if query.trim()}
						No {kind === 'all' ? '' : kind.toUpperCase()} tokens match “{query.trim()}”.
					{:else}
						No {kind.toUpperCase()} tokens yet.
					{/if}
				</p>
			{/if}

			<!-- nothing above the first row to clear, so it sits closer to the search -->
			<ul class="divide-y divide-border [&>li:first-child]:pt-2">
				{#each results as token (token._id)}
					<li class="flex items-center justify-between gap-4 py-3.5">
						<div class="flex min-w-0 items-center gap-2.5">
							<RowCheckbox
								checked={selection.has(token)}
								onCheckedChange={(checked) => selection.set(token, checked)}
								label="Select {token.name}"
							/>
							<div class="flex min-w-0 flex-col gap-1">
								<div class="flex min-w-0 items-center gap-2">
									<span class="truncate text-sm text-card-foreground">
										<Highlighted text={token.name} terms={queryTerms} />
									</span>
									{#if token.kind === 'mcp'}
										<Badge variant="outline" title="Connected over MCP">MCP</Badge>
									{/if}
								</div>
								<!-- the font's space is too tight for the dot to read as a separator, so it gets its own margin -->
								<span class="text-[13px] text-muted-foreground">
									Created {day(token.createdAt)}<span class="mx-1.5">·</span>{token.lastUsedAt
										? `Last used ${day(token.lastUsedAt)}`
										: 'Never used'}
								</span>
							</div>
						</div>

						<DropdownMenu.Root>
							<DropdownMenu.Trigger>
								{#snippet child({ props })}
									<Button
										{...props}
										variant="ghost"
										size="icon-sm"
										aria-label="Actions for {token.name}"
									>
										<RiMoreFill class="text-muted-foreground" />
									</Button>
								{/snippet}
							</DropdownMenu.Trigger>

							<DropdownMenu.Content align="end">
								<DropdownMenu.Item variant="destructive" onSelect={() => revoke([token])}>
									<RiDeleteBinLine />
									Revoke
								</DropdownMenu.Item>
							</DropdownMenu.Content>
						</DropdownMenu.Root>
					</li>
				{/each}
			</ul>
		</div>
	</section>
</div>

<!-- forgotten once the close animation ends, so it does not swap content mid-fade -->
<Modal.Root bind:open onOpenChangeComplete={(isOpen) => !isOpen && (minted = undefined)}>
	<Modal.Content class="sm:max-w-md">
		{#if minted}
			<Modal.Header>
				<Modal.Title>Copy this now</Modal.Title>
				<Modal.Description>
					It is shown once and never stored. If you lose it, create another.
				</Modal.Description>
			</Modal.Header>

			<div class="flex items-center gap-2">
				<!-- an input rather than text, so it stays on one line and select-all takes just the token -->
				<Input
					value={minted}
					readonly
					aria-label="Token"
					spellcheck="false"
					class="font-mono text-[13px] md:text-[13px]"
					onfocus={(e) => e.currentTarget.select()}
				/>
				<CopyButton text={minted} variant="outline" size="icon-sm" aria-label="Copy token" />
			</div>

			<Modal.Footer>
				<Button onclick={() => (open = false)}>Done</Button>
			</Modal.Footer>
		{:else}
			<form
				method="POST"
				action="?/create"
				use:enhance={() => {
					creating = true;
					return async ({ result, update }) => {
						// keep the dialog open so the minted token can be shown in it
						if (result.type === 'success') minted = result.data?.token as string | undefined;
						await update({ reset: false });
						creating = false;
					};
				}}
			>
				<Modal.Header>
					<Modal.Title>Create a CLI token</Modal.Title>
					<Modal.Description>Name it after the machine or job that will use it.</Modal.Description>
				</Modal.Header>

				<div class="flex flex-col gap-2 py-6">
					<Label for="token-name">Name</Label>
					<Input id="token-name" name="name" placeholder="macbook-pro" autocomplete="off" />
				</div>

				<Modal.Footer>
					<Button type="button" variant="ghost" onclick={() => (open = false)}>Cancel</Button>
					<LoadingButton type="submit" loading={creating}>Create</LoadingButton>
				</Modal.Footer>
			</form>
		{/if}
	</Modal.Content>
</Modal.Root>
