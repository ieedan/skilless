<script lang="ts">
	import { setMode, userPrefersMode } from 'mode-watcher';
	import * as Drawer from '$lib/components/ui/drawer';
	import { Switch } from '$lib/components/ui/switch';
	import type { AppUser } from '$lib/user';
	import Avatar from './avatar.svelte';
	import { AccountActions, THEMES } from './account-actions.svelte';
	import RiLogoutBoxRLine from 'remixicon-svelte/icons/logout-box-r-line';

	let { user, hideEmail }: { user: AppUser; hideEmail: boolean } = $props();

	const account = new AccountActions();
</script>

<Drawer.Root>
	<Drawer.Trigger
		class="shrink-0 rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
		aria-label="Account"
	>
		<Avatar seed={user.seed} size={30} />
	</Drawer.Trigger>

	<Drawer.Content>
		<Drawer.Header class="flex-row items-center gap-3">
			<Avatar seed={user.seed} size={36} />
			<div class="flex min-w-0 flex-col">
				<Drawer.Title class="truncate">{user.name}</Drawer.Title>
				{#if user.subtitle}
					<Drawer.Description class="truncate">{user.subtitle}</Drawer.Description>
				{:else}
					<Drawer.Description class="sr-only">Your account</Drawer.Description>
				{/if}
			</div>
		</Drawer.Header>

		<Drawer.Separator />

		<div class="flex items-center justify-between gap-3 px-2 py-2">
			<span id="drawer-theme-label" class="text-sm">Theme</span>
			<div
				role="radiogroup"
				aria-labelledby="drawer-theme-label"
				class="flex items-center gap-0.5 rounded-lg border border-border p-0.5"
			>
				{#each THEMES as theme (theme.value)}
					{@const Icon = theme.icon}
					{@const checked = userPrefersMode.current === theme.value}
					<button
						type="button"
						role="radio"
						aria-checked={checked}
						aria-label={theme.label}
						onclick={() => setMode(theme.value)}
						class={[
							'flex size-8 items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
							checked ? 'bg-muted text-foreground' : 'text-muted-foreground'
						]}
					>
						<Icon class="size-4" aria-hidden="true" />
					</button>
				{/each}
			</div>
		</div>

		<label class="flex items-center justify-between gap-3 px-2 py-2.5 text-sm">
			Hide email
			<Switch
				checked={account.pendingHideEmail ?? hideEmail}
				onCheckedChange={(value) => account.setHideEmail(value)}
			/>
		</label>

		<Drawer.Separator />

		<Drawer.Item variant="destructive" onclick={() => account.signOut()}>
			<RiLogoutBoxRLine />
			Sign out
		</Drawer.Item>
	</Drawer.Content>
</Drawer.Root>
