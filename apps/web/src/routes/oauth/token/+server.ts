import { api } from '@skilless/platform';
import type { RequestHandler } from '@sveltejs/kit';
import { hashToken, mintToken } from '$lib/server/hash';
import { isPkceValue, oauthError, preflight, s256, withCors } from '$lib/server/oauth';

async function readParams(request: Request): Promise<URLSearchParams | null> {
	const type = request.headers.get('content-type') ?? '';

	try {
		if (type.includes('application/json')) {
			const body = (await request.json()) as Record<string, unknown>;
			return new URLSearchParams(
				Object.entries(body).flatMap(([key, value]) =>
					typeof value === 'string' ? [[key, value]] : []
				)
			);
		}

		return new URLSearchParams(await request.text());
	} catch {
		return null;
	}
}

/** Exchanges an authorization code for a token. The only grant there is. */
export const POST: RequestHandler = async ({ request, locals }) => {
	const params = await readParams(request);
	if (!params) return oauthError('invalid_request', 'Could not read the request body.');

	if (params.get('grant_type') !== 'authorization_code') {
		return oauthError('unsupported_grant_type', 'Only authorization_code is supported.');
	}

	const code = params.get('code');
	const clientId = params.get('client_id');
	const redirectUri = params.get('redirect_uri');
	const verifier = params.get('code_verifier');

	if (!code || !clientId || !redirectUri) {
		return oauthError('invalid_request', 'code, client_id and redirect_uri are required.');
	}
	if (!isPkceValue(verifier)) {
		return oauthError('invalid_request', 'A valid code_verifier is required.');
	}

	const token = mintToken();

	const { ok } = await locals.convexSecret.mutation(api.oauth.exchange, {
		hash: hashToken(code),
		clientId,
		redirectUri,
		codeChallenge: s256(verifier),
		tokenHash: hashToken(token)
	});

	if (!ok) {
		return oauthError('invalid_grant', 'That code is invalid, expired or already used.');
	}

	return withCors(
		Response.json(
			{ access_token: token, token_type: 'Bearer' },
			{ headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' } }
		)
	);
};

export const OPTIONS: RequestHandler = () => preflight();
