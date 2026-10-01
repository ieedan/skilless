<script lang="ts">
	import { page } from '$app/state';
	import { authClient } from '@skilless/platform/client';
	import { APP_NAME } from '$lib/constants';
	import { LoadingButton } from '$lib/components/ui/loading-button';
	import GithubLogo from '$lib/components/app/github-logo.svelte';
	import Logo from '$lib/components/app/logo.svelte';

	let error = $state<string | null>(null);

	const redirectTo = $derived(page.url.searchParams.get('redirectTo') ?? '/my-skills');

	async function signIn() {
		error = null;

		// via /github/setup, which sends anyone without the app installed to install it first
		const result = await authClient.signIn.social({
			provider: 'github',
			callbackURL: `/github/setup?redirectTo=${encodeURIComponent(redirectTo)}`
		});

		// on success the browser is already navigating away, so only failure lands here
		if (result.error) error = 'Could not sign in. Try again.';
	}
</script>

<svelte:head><title>Sign in · {APP_NAME}</title></svelte:head>

<main class="flex min-h-dvh flex-col items-center justify-center bg-background px-6">
	<div class="flex w-full max-w-100 flex-col items-center gap-8 p-10">
		<!-- the logo and its caption read as one unit, closer than the button below -->
		<div class="flex flex-col items-center gap-4">
			<a href="/" class="flex">
				<Logo class="h-5" />
			</a>

			<p class="text-center text-sm text-muted-foreground">Sign in to continue</p>
		</div>

		<LoadingButton onClickPromise={signIn} class="w-full">
			<GithubLogo />
			Continue with GitHub
		</LoadingButton>

		{#if error}
			<p class="text-sm text-destructive" role="alert">{error}</p>
		{/if}
	</div>
</main>
