<script lang="ts">
	import { DropdownMenu as DropdownMenuPrimitive } from 'bits-ui';
	import { setMode, userPrefersMode } from 'mode-watcher';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import type { AppUser } from '$lib/user';
	import Avatar from './avatar.svelte';
	import { AccountActions, THEMES, type Theme } from './account-actions.svelte';
	import RiLogoutBoxRLine from 'remixicon-svelte/icons/logout-box-r-line';

	let { user, hideEmail }: { user: AppUser; hideEmail: boolean } = $props();

	const account = new AccountActions();
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger
		class="shrink-0 rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
		aria-label="Account"
	>
		<Avatar seed={user.seed} size={30} />
	</DropdownMenu.Trigger>

	<DropdownMenu.Content align="end" class="w-60">
		<div class="flex items-center gap-2.5 px-1.5 py-1.5">
			<Avatar seed={user.seed} size={32} />
			<div class="flex min-w-0 flex-col">
				<span class="truncate text-sm text-popover-foreground">{user.name}</span>
				{#if user.subtitle}
					<span class="truncate text-xs text-muted-foreground">{user.subtitle}</span>
				{/if}
			</div>
		</div>

		<DropdownMenu.Separator />

		<!--
			The three options are still menu items, so arrow keys reach them like
			anything else in the menu; they just sit in one row as icons.
		-->
		<div class="flex items-center justify-between gap-2 py-0.5 pr-0.5 pl-1.5">
			<span id="theme-label" class="text-sm">Theme</span>
			<DropdownMenuPrimitive.RadioGroup
				value={userPrefersMode.current}
				onValueChange={(value) => setMode(value as Theme)}
				aria-labelledby="theme-label"
				class="flex items-center gap-0.5 rounded-lg border border-border p-0.5"
			>
				{#each THEMES as theme (theme.value)}
					{@const Icon = theme.icon}
					<DropdownMenuPrimitive.RadioItem
						value={theme.value}
						closeOnSelect={false}
						aria-label={theme.label}
						title={theme.label}
						class="flex size-6 items-center justify-center rounded-md text-muted-foreground outline-hidden select-none data-highlighted:text-foreground data-highlighted:ring-2 data-highlighted:ring-ring/50 data-[state=checked]:bg-muted data-[state=checked]:text-foreground"
					>
						<Icon class="size-3.5" aria-hidden="true" />
					</DropdownMenuPrimitive.RadioItem>
				{/each}
			</DropdownMenuPrimitive.RadioGroup>
		</div>

		<DropdownMenu.CheckboxItem
			checked={account.pendingHideEmail ?? hideEmail}
			onCheckedChange={(value) => account.setHideEmail(value)}
			closeOnSelect={false}
		>
			Hide email
		</DropdownMenu.CheckboxItem>

		<DropdownMenu.Separator />

		<DropdownMenu.Item variant="destructive" onSelect={() => account.signOut()}>
			<RiLogoutBoxRLine />
			Sign out
		</DropdownMenu.Item>
	</DropdownMenu.Content>
</DropdownMenu.Root>
