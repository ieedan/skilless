import { createSvelteKitHandler } from '@mmailaender/convex-better-auth-svelte/sveltekit';

// proxies auth through SvelteKit so callbacks point at skilless.dev, not Convex
export const { GET, POST } = createSvelteKitHandler();
