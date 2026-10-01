<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import GithubLogo from '$lib/components/app/github-logo.svelte';
	import Logo from '$lib/components/app/logo.svelte';
	import SiteFooter from '$lib/components/app/site-footer.svelte';

	let { data, children } = $props();

	// `/` sends signed-in visitors to the app, so the marketing page is at /home for them
	const home = $derived(data.signedIn ? '/home' : '/');
</script>

<!-- the shell of anything shared by address: a skill or a pack, readable signed out -->
<div class="flex min-h-dvh flex-col bg-background">
	<header
		class="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75"
	>
		<div class="mx-auto flex h-14 w-full max-w-4xl items-center gap-4 px-4 md:px-6">
			<a href={home} class="flex py-1" aria-label="skilless home">
				<Logo class="h-3.5" />
			</a>
			<a href="/docs" class="text-sm font-medium">Docs</a>

			<nav class="ml-auto flex items-center gap-2">
				<Button
					href="https://github.com/ieedan/skilless"
					variant="ghost"
					size="icon-sm"
					aria-label="skilless on GitHub"
				>
					<GithubLogo />
				</Button>
				{#if data.signedIn}
					<Button href="/my-skills" variant="outline" size="sm">Dashboard</Button>
				{:else}
					<Button href="/login" variant="outline" size="sm">Log in</Button>
				{/if}
			</nav>
		</div>
	</header>

	<main class="mx-auto w-full max-w-4xl flex-1 px-4 pb-16 md:px-6">
		{@render children()}
	</main>

	<SiteFooter signedIn={data.signedIn} class="max-w-4xl px-4 md:px-6" />
</div>
