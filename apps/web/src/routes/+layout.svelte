<script lang="ts">
	import './layout.css';
	import {
		createSvelteAuthClient,
		type AuthClient
	} from '@mmailaender/convex-better-auth-svelte/svelte';
	import { authClient, setupConvex } from '@skilless/platform/client';
	import { env } from '$lib/env.client';

	let { children } = $props();

	createSvelteAuthClient({ authClient: authClient as unknown as AuthClient });
	setupConvex(env.PUBLIC_CONVEX_URL);
</script>

{@render children()}
