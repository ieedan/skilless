import { getAuthState } from '@mmailaender/convex-better-auth-svelte/sveltekit';

/**
 * Whether this request came in signed in, read off the token hooks.server.ts
 * already put in scope. The client needs it before hydration finishes: told
 * it is signed in, it authenticates the socket before the pages' live queries
 * subscribe. Without it they subscribe signed out first, get nothing back, and
 * swap the server-rendered data for empty states until auth catches up.
 */
export function load() {
	return { authState: getAuthState() };
}
