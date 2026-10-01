<script lang="ts" module>
	/**
	 * The site's one width, shared by the header, every page below it, and the
	 * footer: the docs' (sidebar, article and table of contents), the widest.
	 */
	export const SITE_WIDTH = 'max-w-7xl px-4 md:px-6';
	/** The header's height, for anything that sticks below it. */
	export const HEADER_HEIGHT = 'h-16';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { cn } from '$lib/utils';
	import Logo from './logo.svelte';

	/**
	 * The header on everything outside the app: home, the docs, and what is
	 * shared by address. One header, so moving between them never shifts it.
	 */
	let {
		signedIn = false,
		leading
	}: {
		signedIn?: boolean;
		/** Before the logo, like the docs' menu button on a phone. */
		leading?: Snippet;
	} = $props();
</script>

<header
	class="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75"
>
	<div class={cn('mx-auto flex w-full items-center gap-2', HEADER_HEIGHT, SITE_WIDTH)}>
		{@render leading?.()}

		<!-- `/` sends signed-in visitors to the app; the marketing page is /home for them -->
		<a href={signedIn ? '/home' : '/'} class="flex py-1" aria-label="skilless home">
			<Logo class="h-4" />
		</a>

		<nav class="ml-auto flex items-center gap-1">
			<!-- in the footer on a phone, where the header has no room for them -->
			<Button href="/skills" variant="ghost" class="max-sm:hidden">Skills</Button>
			<Button href="/packs" variant="ghost" class="max-sm:hidden">Packs</Button>
			<Button href="/docs" variant="ghost">Docs</Button>
			{#if signedIn}
				<!-- a little apart from the links, as the one thing to press -->
				<Button href="/my-skills" class="ml-2">Dashboard</Button>
			{:else}
				<Button href="/login" class="ml-2">Sign Up</Button>
				<Button href="/login" variant="outline" class="ml-1">Login</Button>
			{/if}
		</nav>
	</div>
</header>
