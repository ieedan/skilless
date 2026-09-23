import { SecretClient } from '@skilless/platform/client';
import { createConvexHttpClient, getToken } from '@mmailaender/convex-better-auth-svelte/sveltekit';
import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { initConvex } from 'convex-svelte/sveltekit';
import { withServerConvexToken } from 'convex-svelte/sveltekit/server';
import { env } from '$lib/env.server';

// convexLoad reads the deployment URL from here; on the server the client it
// creates is disabled and only the URL is used
initConvex(env.PUBLIC_CONVEX_URL);

const withToken: Handle = async ({ event, resolve }) => {
	const token = getToken(event.cookies);
	event.locals.token = token;
	return withServerConvexToken(token, () => resolve(event));
};

const injectConvex: Handle = async ({ event, resolve }) => {
	event.locals.convex = createConvexHttpClient();
	event.locals.convexSecret = new SecretClient(createConvexHttpClient(), env.FUNCTION_SECRET);

	return resolve(event);
};

export const handle = sequence(withToken, injectConvex);
