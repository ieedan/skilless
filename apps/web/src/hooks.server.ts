import { SecretClient } from '@skilless/platform/client';
import { createConvexHttpClient, getToken } from '@mmailaender/convex-better-auth-svelte/sveltekit';
import { dev } from '$app/environment';
import { type Handle, json, text } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { initConvex } from 'convex-svelte/sveltekit';
import { withServerConvexToken } from 'convex-svelte/sveltekit/server';
import { env } from '$lib/env.server';

// convexLoad reads the deployment URL from here; on the server the client it
// creates is disabled and only the URL is used
initConvex(env.PUBLIC_CONVEX_URL);

/** Content types a plain HTML form can send, so the ones a cross-site form can forge. */
const FORM_TYPES = [
	'application/x-www-form-urlencoded',
	'multipart/form-data',
	'text/plain',
	'application/x-sveltekit-formdata'
];

/**
 * Takes no cookies, and is posted to by MCP clients from anywhere, often with no
 * `Origin` at all, in the form encoding OAuth requires.
 */
const CSRF_EXEMPT = new Set(['/oauth/token']);

/**
 * SvelteKit's own cross-site form check, which svelte.config.js turns off
 * because it cannot exempt a route. Same rule, bar the exemptions.
 */
const csrf: Handle = async ({ event, resolve }) => {
	const { request, url } = event;
	const type = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() ?? '';

	const forbidden =
		!dev &&
		!CSRF_EXEMPT.has(url.pathname) &&
		['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) &&
		FORM_TYPES.includes(type) &&
		request.headers.get('origin') !== url.origin;

	if (forbidden) {
		const message = `Cross-site ${request.method} form submissions are forbidden`;
		return request.headers.get('accept') === 'application/json'
			? json({ message }, { status: 403 })
			: text(message, { status: 403 });
	}

	return resolve(event);
};

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

export const handle = sequence(csrf, withToken, injectConvex);
