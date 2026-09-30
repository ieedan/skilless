<script lang="ts">
	import { page } from '$app/state';
	import { APP_NAME } from '$lib/constants';
	import { Button } from '$lib/components/ui/button';
	import Logo from '$lib/components/app/logo.svelte';

	let { data, form } = $props();

	const error = $derived(form?.error ?? data.error);

	// named actions ride along with the original query, which each action re-validates
	const query = $derived(
		new URLSearchParams([...page.url.searchParams].filter(([key]) => !key.startsWith('/')))
	);
	const action = (name: string) => `?${query}&/${name}`;
</script>

<svelte:head><title>Authorize · {APP_NAME}</title></svelte:head>

<main class="flex min-h-dvh flex-col items-center justify-center bg-background px-4">
	<div class="flex w-full max-w-100 flex-col items-center gap-8 p-6 sm:p-10">
		<a href="/" class="flex">
			<Logo class="h-5" />
		</a>

		{#if error || !data.client}
			<div class="flex flex-col items-center gap-2 text-center">
				<h1 class="text-base font-semibold">This link can't be used</h1>
				<p class="text-sm text-muted-foreground">{error}</p>
			</div>
		{:else}
			<div class="flex flex-col items-center gap-2 text-center">
				<h1 class="text-base font-semibold text-balance">
					Connect {data.client.name} to {APP_NAME}?
				</h1>
				<p class="text-sm text-balance text-muted-foreground">
					It will be able to read, create, edit and delete the skills in your library, and choose
					which projects they're added to.
				</p>
			</div>

			<form method="POST" class="flex w-full flex-col gap-3">
				<Button type="submit" formaction={action('approve')} class="w-full">Allow access</Button>
				<Button type="submit" formaction={action('deny')} variant="outline" class="w-full">
					Cancel
				</Button>
			</form>

			<p class="text-center text-xs text-balance text-muted-foreground">
				You'll be sent back to <span class="font-medium text-foreground"
					>{data.client.destination}</span
				>. Revoke access any time from
				<a href="/settings" class="underline underline-offset-2">settings</a>.
			</p>
		{/if}
	</div>
</main>
