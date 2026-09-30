import { api } from '@skilless/platform';
import { redirect } from '@sveltejs/kit';
import { hashToken, mintToken } from '$lib/server/hash';
import { type Client, isPkceValue, resolveClient } from '$lib/server/oauth';

type Request =
	| { ok: true; client: Client; redirectUri: string; state: string | null; codeChallenge: string }
	/** Nowhere safe to send the user back to, so the page shows the error itself. */
	| { ok: false; message: string };

/** The URL a client gets back, with RFC 9207's `iss` so it can tell servers apart. */
function callback(redirectUri: string, origin: string, state: string | null, params: object) {
	const url = new URL(redirectUri);
	for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
	if (state) url.searchParams.set('state', state);
	url.searchParams.set('iss', origin);
	return url.toString();
}

/**
 * Validates an authorization request. Until the client and redirect URI check
 * out, errors are shown here; after, they go back to the client (RFC 6749 §4.1.2.1).
 */
async function parse(url: URL): Promise<Request> {
	const params = url.searchParams;
	const client = await resolveClient(params.get('client_id'));

	if (!client) {
		return { ok: false, message: 'The app asking for access is not one skilless recognizes.' };
	}

	const redirectUri =
		params.get('redirect_uri') ??
		(client.redirectUris.length === 1 ? client.redirectUris[0] : null);

	if (!redirectUri || !client.redirectUris.includes(redirectUri)) {
		return { ok: false, message: `${client.name} sent a redirect address it did not register.` };
	}

	const state = params.get('state');
	const fail = (error: string, description: string) =>
		redirect(
			303,
			callback(redirectUri, url.origin, state, { error, error_description: description })
		);

	if (params.get('response_type') !== 'code') {
		fail('unsupported_response_type', 'Only the code response type is supported.');
	}

	const codeChallenge = params.get('code_challenge');
	if (!isPkceValue(codeChallenge) || params.get('code_challenge_method') !== 'S256') {
		fail('invalid_request', 'PKCE with code_challenge_method S256 is required.');
	}

	return { ok: true, client, redirectUri, state, codeChallenge: codeChallenge! };
}

function requireSignIn(locals: App.Locals, url: URL) {
	if (!locals.token) {
		redirect(302, `/login?redirectTo=${encodeURIComponent(url.pathname + url.search)}`);
	}
}

export async function load({ locals, url }) {
	const request = await parse(url);
	if (!request.ok) return { error: request.message };

	requireSignIn(locals, url);

	return {
		error: null,
		client: {
			name: request.client.name,
			// the name is whatever the client chose to call itself; where it sends you is not
			destination: new URL(request.redirectUri).host || request.redirectUri
		}
	};
}

export const actions = {
	approve: async ({ locals, url }) => {
		const request = await parse(url);
		if (!request.ok) return { error: request.message };

		requireSignIn(locals, url);

		const code = mintToken();

		await locals.convex.mutation(api.oauth.createCode, {
			hash: hashToken(code),
			clientId: request.client.clientId,
			clientName: request.client.name,
			redirectUri: request.redirectUri,
			codeChallenge: request.codeChallenge
		});

		redirect(303, callback(request.redirectUri, url.origin, request.state, { code }));
	},

	deny: async ({ url }) => {
		const request = await parse(url);
		if (!request.ok) return { error: request.message };

		redirect(
			303,
			callback(request.redirectUri, url.origin, request.state, {
				error: 'access_denied',
				error_description: 'The user declined.'
			})
		);
	}
};
