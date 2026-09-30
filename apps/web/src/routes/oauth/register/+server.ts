import type { RequestHandler } from '@sveltejs/kit';
import { oauthError, preflight, registerClient, withCors } from '$lib/server/oauth';

/** Dynamic client registration (RFC 7591). Stores nothing; see `registerClient`. */
export const POST: RequestHandler = async ({ request }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return oauthError('invalid_client_metadata', 'Send the client metadata as JSON.');
	}

	const result = registerClient(body);
	if (!result.ok) return oauthError(result.error, result.description);

	const { client } = result;

	return withCors(
		Response.json(
			{
				client_id: client.clientId,
				client_id_issued_at: Math.floor(Date.now() / 1000),
				client_name: client.name,
				redirect_uris: client.redirectUris,
				// every client is public: PKCE stands in for a secret
				token_endpoint_auth_method: 'none',
				grant_types: ['authorization_code'],
				response_types: ['code']
			},
			{ status: 201, headers: { 'Cache-Control': 'no-store' } }
		)
	);
};

export const OPTIONS: RequestHandler = () => preflight();
