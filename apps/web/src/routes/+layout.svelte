<script lang="ts">
	import './layout.css';
	import { page } from '$app/state';
	import {
		createSvelteAuthClient,
		type AuthClient
	} from '@mmailaender/convex-better-auth-svelte/svelte';
	import { authClient, setupConvex } from '@skilless/platform/client';
	import { env } from '$lib/env.client';
	import { Toaster } from '$lib/components/ui/sonner';
	import { ModeWatcher } from 'mode-watcher';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { APP_DESCRIPTION, APP_NAME } from '$lib/constants';
	import { onListKeydown } from '$lib/list-nav';

	let { children, data } = $props();

	createSvelteAuthClient({
		authClient: authClient as unknown as AuthClient,
		getServerState: () => data.authState
	});
	setupConvex(env.PUBLIC_CONVEX_URL);

	/**
	 * The colour a phone tints its chrome with — on iOS the bar around the
	 * address field, which sits directly under the page.
	 *
	 * Read off the canvas rather than written down, because the canvas already
	 * answers both halves of the question: which mode is live (the one picked in
	 * the app, which `prefers-color-scheme` in a static tag would not see) and
	 * which surface this page sits on (--card under the app shell, --background
	 * elsewhere). Until it resolves there is no tag at all, which leaves the
	 * browser to tint from that same canvas.
	 */
	let themeColor = $state<string>();

	$effect(() => {
		// a navigation can change the surface underfoot
		void page.url.pathname;

		const sync = () => (themeColor = getComputedStyle(document.body).backgroundColor);
		sync();

		/*
		 * A mode change does not land with the state that announced it: mode-watcher
		 * swaps the class on <html> in an animation frame of its own, so reading on
		 * `mode.current` returns the colour we are leaving. Watch for the swap
		 * itself instead, which is true however it is scheduled.
		 */
		const swaps = new MutationObserver(sync);
		swaps.observe(document.documentElement, { attributeFilter: ['class', 'style'] });
		return () => swaps.disconnect();
	});
</script>

<!-- defaults for every page; crawlers and link unfurls need absolute URLs -->
<svelte:head>
	<meta name="description" content={APP_DESCRIPTION} />
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content={APP_NAME} />
	<meta property="og:title" content={APP_NAME} />
	<meta property="og:description" content={APP_DESCRIPTION} />
	<meta property="og:url" content={page.url.href} />
	<meta property="og:image" content="{page.url.origin}/og.png" />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content="{APP_NAME}: {APP_DESCRIPTION}" />
	<meta name="twitter:card" content="summary_large_image" />

	{#if themeColor}
		<meta name="theme-color" content={themeColor} />
	{/if}
</svelte:head>

<!-- arrow keys through whichever lists the page has -->
<svelte:document onkeydown={onListKeydown} />

<ModeWatcher />
<Toaster position="bottom-right" />

<!-- one provider so every tooltip shares a delay, and moving between them skips it -->
<Tooltip.Provider>
	{@render children()}
</Tooltip.Provider>
