<script lang="ts">
	import { enhance } from '$app/forms';
	import { APP_NAME } from '$lib/constants';
	import { Button } from '$lib/components/ui/button';
	import { LoadingButton } from '$lib/components/ui/loading-button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';

	let { data, form } = $props();

	let open = $state(false);
	let creating = $state(false);
	let copied = $state(false);

	// The plaintext is shown once and never stored, so the dialog stays open to
	// present it rather than dropping it into the page behind.
	const minted = $derived(open ? form?.token : undefined);

	function day(ms: number) {
		return new Date(ms).toLocaleDateString('en-GB', {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}

	async function copyToken(token: string) {
		try {
			await navigator.clipboard.writeText(token);
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch {
			// clipboard unavailable — the token is selectable in the dialog
		}
	}
</script>

<svelte:head><title>Tokens · {APP_NAME}</title></svelte:head>

<div class="mx-auto flex w-full max-w-3xl flex-col gap-6 p-8">
	<div class="flex items-start justify-between gap-6">
		<div class="flex flex-col gap-1.5">
			<h1 class="text-base font-semibold text-card-foreground">CLI tokens</h1>
			<p class="text-[13px] text-muted-foreground">
				Tokens let the skilless CLI authenticate as you. Set one as
				<code class="font-mono text-foreground">SKILLESS_TOKEN</code> in a cloud agent's environment
				so
				<code class="font-mono text-foreground">skilless install</code> can run without a browser.
			</p>
		</div>

		<Button size="sm" onclick={() => (open = true)}>
			<i class="ri-add-line"></i>
			Create token
		</Button>
	</div>

	{#if data.tokens.length === 0}
		<p class="border-t border-border pt-6 text-[13px] text-muted-foreground">No tokens yet.</p>
	{:else}
		<ul class="divide-y divide-border border-t border-border">
			{#each data.tokens as token (token._id)}
				<li class="flex items-center justify-between gap-4 py-3.5">
					<div class="flex min-w-0 flex-col gap-1">
						<span class="truncate font-mono text-sm text-card-foreground">{token.name}</span>
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
									<i class="ri-more-fill text-base leading-none text-muted-foreground"></i>
								</Button>
							{/snippet}
						</DropdownMenu.Trigger>

						<DropdownMenu.Content align="end">
							<DropdownMenu.Item variant="destructive">
								{#snippet child({ props })}
									<form method="POST" action="?/revoke" use:enhance class="contents">
										<input type="hidden" name="tokenId" value={token._id} />
										<button {...props} type="submit">
											<i class="ri-delete-bin-line"></i>
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
</div>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-md">
		{#if minted}
			<Dialog.Header>
				<Dialog.Title>Copy this now</Dialog.Title>
				<Dialog.Description>
					It is shown once and never stored. If you lose it, create another.
				</Dialog.Description>
			</Dialog.Header>

			<div class="flex items-center gap-3 border border-border bg-background p-3">
				<code class="min-w-0 flex-1 overflow-x-auto font-mono text-[13px] text-foreground">
					{minted}
				</code>
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label={copied ? 'Copied' : 'Copy token'}
					onclick={() => copyToken(minted)}
				>
					<i class="{copied ? 'ri-check-line' : 'ri-file-copy-line'} text-base leading-none"></i>
				</Button>
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
					return async ({ update }) => {
						// keep the dialog open so the minted token can be shown in it
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
