import type { Transport } from '@sveltejs/kit';
import { decodeConvexLoad, encodeConvexLoad } from 'convex-svelte/sveltekit';

/**
 * Carries `convexLoad` results across the SSR boundary. The server hands over
 * the data it fetched; the client decodes it into a live subscription seeded
 * with that data, so pages loaded this way update in realtime.
 */
export const transport: Transport = {
	ConvexLoadResult: { encode: encodeConvexLoad, decode: decodeConvexLoad }
};
