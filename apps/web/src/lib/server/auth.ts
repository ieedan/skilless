import { api as convex } from '@skilless/platform';
import { SecretClient } from '@skilless/platform/client';
import { ConvexHttpClient } from 'convex/browser';
import { env } from '$lib/env.server';
import { hashToken } from './hash';

export type Authenticated = { userId: string; convex: SecretClient };

/**
 * Resolves a `Bearer` token minted by `skilless auth` or the settings page to
 * its user. Null when the header is missing or the token is not valid.
 */
export async function authenticate(header: string | undefined): Promise<Authenticated | null> {
	if (!header?.startsWith('Bearer ')) return null;

	const client = new SecretClient(new ConvexHttpClient(env.PUBLIC_CONVEX_URL), env.FUNCTION_SECRET);

	try {
		const { userId } = await client.mutation(convex.tokens.verify, {
			hash: hashToken(header.slice('Bearer '.length))
		});

		return { userId, convex: client };
	} catch {
		return null;
	}
}
