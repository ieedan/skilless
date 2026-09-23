<script lang="ts">
	import { enhance } from '$app/forms';
	import { APP_NAME } from '$lib/constants';
	import { Button } from '$lib/components/ui/button';
	import RiAddLine from 'remixicon-svelte/icons/add-line';
	import RiDeleteBinLine from 'remixicon-svelte/icons/delete-bin-line';
	import RiMoreFill from 'remixicon-svelte/icons/more-fill';
	import { LoadingButton } from '$lib/components/ui/loading-button';
	import { CopyButton } from '$lib/components/ui/copy-button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';

	let { data } = $props();

	const tokens = $derived(data.tokens.data ?? []);

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

<div class="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 md:p-8">
	<!-- the only section so far; later settings get their own, each headed like this one -->
	<section class="flex flex-col gap-6" aria-labelledby="tokens-heading">
		<div class="flex items-start justify-between gap-6">
			<div class="flex flex-col gap-1.5">
				<h2 id="tokens-heading" class="text-base font-semibold text-card-foreground">CLI tokens</h2>
				<p class="text-[13px] text-muted-foreground">
					Tokens allow you to headlessly authenticate to the skilless CLI.
				</p>
			</div>

			<Button size="sm" onclick={() => (open = true)}>
				<RiAddLine />
				Create token
			</Button>
		</div>

		{#if tokens.length === 0}
			<p class="border-t border-border pt-6 text-[13px] text-muted-foreground">No tokens yet.</p>
		{:else}
			<ul class="divide-y divide-border border-t border-border">
				{#each tokens as token (token._id)}
					<li class="flex items-center justify-between gap-4 py-3.5">
						<div class="flex min-w-0 flex-col gap-1">
							<span class="truncate text-sm text-card-foreground">{token.name}</span>
							<span class="text-[13px] text-muted-foreground">
								Created {day(token.createdAt)}
								{#if token.lastUsedAt}
									· Last used {day(token.lastUsedAt)}
								{:else}
									· Never used
								{/if}
							</span>
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
								<DropdownMenu.Item variant="destructive">
									{#snippet child({ props })}
										<form method="POST" action="?/revoke" use:enhance class="contents">
											<input type="hidden" name="tokenId" value={token._id} />
											<button {...props} type="submit">
												<RiDeleteBinLine />
												Revoke
											</button>
										</form>
									{/snippet}
								</DropdownMenu.Item>
							</DropdownMenu.Content>
						</DropdownMenu.Root>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>

<!-- forgotten once the close animation ends, so it does not swap content mid-fade -->
<Dialog.Root bind:open onOpenChangeComplete={(isOpen) => !isOpen && (minted = undefined)}>
	<Dialog.Content class="sm:max-w-md">
		{#if minted}
			<Dialog.Header>
				<Dialog.Title>Copy this now</Dialog.Title>
				<Dialog.Description>
					It is shown once and never stored. If you lose it, create another.
				</Dialog.Description>
			</Dialog.Header>

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

			<Dialog.Footer>
				<Button onclick={() => (open = false)}>Done</Button>
			</Dialog.Footer>
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
				<Dialog.Header>
					<Dialog.Title>Create a CLI token</Dialog.Title>
					<Dialog.Description>Name it after the machine or job that will use it.</Dialog.Description
					>
				</Dialog.Header>

				<div class="flex flex-col gap-2 py-6">
					<Label for="token-name">Name</Label>
					<Input id="token-name" name="name" placeholder="macbook-pro" autocomplete="off" />
				</div>

				<Dialog.Footer>
					<Button type="button" variant="ghost" onclick={() => (open = false)}>Cancel</Button>
					<LoadingButton type="submit" loading={creating}>Create</LoadingButton>
				</Dialog.Footer>
			</form>
		{/if}
	</Dialog.Content>
</Dialog.Root>
