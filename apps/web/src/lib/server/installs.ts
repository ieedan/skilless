import { api } from '@skilless/platform';
import { SecretClient } from '@skilless/platform/client';
import { ConvexHttpClient } from 'convex/browser';
import { env } from '$lib/env.server';

/**
 * `skilless add` says so when it fetches an address to add it, rather than to
 * update from it, so only adds count as installs.
 */
export const INTENT_HEADER = 'x-skilless-intent';

export function isAdd(headers: Headers): boolean {
	return headers.get(INTENT_HEADER) === 'add';
}

/**
 * Counts an install of a skill or pack, signed in or not. Never fails the
 * fetch it rides on: a lost count is better than a failed add.
 */
export async function countInstall(kind: 'skill' | 'pack', username: string, name: string) {
	const client = new SecretClient(new ConvexHttpClient(env.PUBLIC_CONVEX_URL), env.FUNCTION_SECRET);
	await client.mutation(api.installs.recordFor, { kind, username, name }).catch(() => {});
}
