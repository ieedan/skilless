<script lang="ts">
	import { goto } from '$app/navigation';
	import { authClient } from '@skilless/platform/client';
	import { APP_NAME } from '$lib/constants';
	import Avatar from '$lib/components/app/avatar.svelte';
	import { LoadingButton } from '$lib/components/ui/loading-button';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';
	import * as Tabs from '$lib/components/ui/tabs';
	import RiComputerLine from 'remixicon-svelte/icons/computer-line';
	import RiLogoutBoxRLine from 'remixicon-svelte/icons/logout-box-r-line';
	import RiMoonLine from 'remixicon-svelte/icons/moon-line';
	import RiSunLine from 'remixicon-svelte/icons/sun-line';
	import { setMode, userPrefersMode } from 'mode-watcher';
	import { submitAction } from '$lib/submit';
	import { toast } from 'svelte-sonner';

	let { data } = $props();

	/** The switch's state while a change is in flight, so it does not lag a round trip behind the click. */
	let pendingHideEmail = $state<boolean>();
	const hideEmail = $derived(pendingHideEmail ?? data.preferences.hideEmail);

	async function setHideEmail(value: boolean) {
		pendingHideEmail = value;
		try {
			// invalidates, so the layout reloads and the sidebar picks up the change
			const result = await submitAction('?/setHideEmail', { hideEmail: String(value) });
			if (result.type !== 'success') toast.error('Could not update your settings');
		} catch {
			toast.error('Could not update your settings');
		} finally {
			pendingHideEmail = undefined;
		}
	}

	const themes = [
		{ value: 'system', label: 'System', icon: RiComputerLine },
		{ value: 'light', label: 'Light', icon: RiSunLine },
		{ value: 'dark', label: 'Dark', icon: RiMoonLine }
	] as const;

	async function signOut() {
		await authClient.signOut();
		await goto('/login', { invalidateAll: true });
	}
</script>

<svelte:head><title>Account · {APP_NAME}</title></svelte:head>

<div class="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 md:gap-7 md:p-8">
	<!-- One row: who you are, and the only thing you can do about it. -->
	<div
		class="flex flex-wrap items-center gap-5 rounded-lg border border-border bg-background p-4 md:p-6"
	>
		<Avatar seed={data.user.seed} size={64} />

		<div class="flex min-w-0 flex-col gap-1.5">
			<p class="truncate text-lg font-semibold text-card-foreground">{data.user.name}</p>
			{#if data.user.subtitle}
				<p class="truncate text-sm text-muted-foreground">{data.user.subtitle}</p>
			{/if}
		</div>

		<LoadingButton variant="destructive-outline" class="ml-auto" onClickPromise={signOut}>
			<RiLogoutBoxRLine />
			Sign out
		</LoadingButton>
	</div>

	<div
		class="flex flex-col items-start gap-4 rounded-lg border border-border bg-background p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 md:p-6"
	>
		<div class="flex flex-col gap-1">
			<Label for="hide-email">Hide email</Label>
			<p class="text-[13px] text-muted-foreground">
				Keep your email out of the sidebar and this page.
			</p>
		</div>
		<Switch id="hide-email" checked={hideEmail} onCheckedChange={setHideEmail} />
	</div>

	<div
		class="flex flex-col items-start gap-4 rounded-lg border border-border bg-background p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 md:p-6"
	>
		<div class="flex flex-col gap-1">
			<Label id="theme-label">Theme</Label>
			<p class="text-[13px] text-muted-foreground">Choose how {APP_NAME} looks on this device.</p>
		</div>
		<Tabs.Root
			value={userPrefersMode.current}
			onValueChange={(value) => setMode(value as (typeof themes)[number]['value'])}
		>
			<Tabs.List aria-labelledby="theme-label">
				{#each themes as theme (theme.value)}
					{@const Icon = theme.icon}
					<Tabs.Trigger value={theme.value} class="px-2.5">
						<Icon aria-hidden="true" />
						{theme.label}
					</Tabs.Trigger>
				{/each}
			</Tabs.List>
		</Tabs.Root>
	</div>
</div>
