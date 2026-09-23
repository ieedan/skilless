import { initConvex } from 'convex-svelte/sveltekit';
import { env } from '$lib/env.client';

// transport.decode runs before the root layout's setupConvex, and needs the
// client to already exist to subscribe
initConvex(env.PUBLIC_CONVEX_URL);
