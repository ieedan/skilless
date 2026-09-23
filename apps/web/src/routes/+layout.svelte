<script lang="ts">
	import './layout.css';
	import {
		createSvelteAuthClient,
		type AuthClient
	} from '@mmailaender/convex-better-auth-svelte/svelte';
	import { authClient, setupConvex } from '@skilless/platform/client';
	import { env } from '$lib/env.client';
	import { Toaster } from '$lib/components/ui/sonner';
	import { ModeWatcher } from 'mode-watcher';
	import * as Tooltip from '$lib/components/ui/tooltip';

	let { children } = $props();

	createSvelteAuthClient({ authClient: authClient as unknown as AuthClient });
	setupConvex(env.PUBLIC_CONVEX_URL);
</script>

<ModeWatcher />
<Toaster position="bottom-right" />

<!-- one provider so every tooltip shares a delay, and moving between them skips it -->
<Tooltip.Provider>
	{@render children()}
</Tooltip.Provider>
