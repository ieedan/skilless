import { convexClient } from '@convex-dev/better-auth/client/plugins';
import { createAuthClient } from 'better-auth/svelte';

/**
 * Deliberately not cast to the adapter's `AuthClient` type — that cast erases
 * `signIn` and friends. Widen at the one call site that needs it instead.
 */
export const authClient = createAuthClient({
	plugins: [convexClient()]
});
