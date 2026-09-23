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

	let { children } = $props();

	createSvelteAuthClient({ authClient: authClient as unknown as AuthClient });
	setupConvex(env.PUBLIC_CONVEX_URL);
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
</svelte:head>

<ModeWatcher />
<Toaster position="bottom-right" />

<!-- one provider so every tooltip shares a delay, and moving between them skips it -->
<Tooltip.Provider>
	{@render children()}
</Tooltip.Provider>
