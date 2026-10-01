<script lang="ts">
	import MenuIcon from '@lucide/svelte/icons/menu';
	import { Button } from '$lib/components/ui/button';
	import * as Sheet from '$lib/components/ui/sheet';
	import DocsNav from '$lib/components/docs/docs-nav.svelte';
	import GithubLogo from '$lib/components/app/github-logo.svelte';
	import Logo from '$lib/components/app/logo.svelte';
	import SiteFooter from '$lib/components/app/site-footer.svelte';

	let { data, children } = $props();

	// `/` sends signed-in visitors to the app, so the marketing page is at /home for them
	const home = $derived(data.signedIn ? '/home' : '/');

	let menuOpen = $state(false);
</script>

<div class="flex min-h-dvh flex-col bg-background">
	<header
		class="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75"
	>
		<div class="mx-auto flex h-14 w-full max-w-7xl items-center gap-4 px-4 md:px-6">
			<Sheet.Root bind:open={menuOpen}>
				<Sheet.Trigger>
					{#snippet child({ props })}
						<Button
							{...props}
							variant="ghost"
							size="icon-sm"
							class="lg:hidden"
							aria-label="Open docs menu"
						>
							<MenuIcon />
						</Button>
					{/snippet}
				</Sheet.Trigger>
				<Sheet.Content side="left" class="overflow-y-auto p-6">
					<Sheet.Title class="sr-only">Docs</Sheet.Title>
					<DocsNav onnavigate={() => (menuOpen = false)} />
				</Sheet.Content>
			</Sheet.Root>

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

	<div class="mx-auto flex w-full max-w-7xl flex-1 gap-10 px-4 md:px-6">
		<aside
			class="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-56 shrink-0 overflow-y-auto py-10 lg:block"
		>
			<DocsNav />
		</aside>

		<div class="min-w-0 flex-1">
			{@render children()}
		</div>
	</div>

	<SiteFooter signedIn={data.signedIn} class="max-w-7xl px-4 md:px-6" />
</div>
