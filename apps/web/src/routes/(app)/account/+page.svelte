<script lang="ts">
	import { goto } from '$app/navigation';
	import { authClient } from '@skilless/platform/client';
	import { APP_NAME } from '$lib/constants';
	import Avatar from '$lib/components/app/avatar.svelte';
	import { LoadingButton } from '$lib/components/ui/loading-button';

	let { data } = $props();

	async function signOut() {
		await authClient.signOut();
		await goto('/login', { invalidateAll: true });
	}
</script>

<svelte:head><title>Account · {APP_NAME}</title></svelte:head>

<div class="mx-auto flex w-full max-w-3xl flex-col gap-7 p-8">
	<!-- One row: who you are, and the only thing you can do about it. -->
	<div class="flex items-center gap-5 border border-border bg-background p-6">
		<Avatar seed={data.user.seed} size={64} />

		<div class="flex min-w-0 flex-col gap-1.5">
			<p class="truncate text-lg font-semibold text-card-foreground">{data.user.name}</p>
			{#if data.user.subtitle}
				<p class="truncate font-mono text-sm text-muted-foreground">{data.user.subtitle}</p>
			{/if}
		</div>

		<LoadingButton variant="destructive-outline" class="ml-auto" onClickPromise={signOut}>
			<i class="ri-logout-box-r-line"></i>
			Sign out
		</LoadingButton>
	</div>
</div>
