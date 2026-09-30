import { api } from '@skilless/platform';
import { fail } from '@sveltejs/kit';
import { convexLoad } from 'convex-svelte/sveltekit';
import { hashToken, mintToken } from '$lib/server/hash';

export async function load() {
	return { tokens: await convexLoad(api.tokens.list, {}) };
}

export const actions = {
	create: async ({ locals, request }) => {
		const data = await request.formData();
		const name = String(data.get('name') ?? '').trim() || 'CLI token';

		// generated here so the plaintext never reaches the database — only its hash
		const token = mintToken();

		await locals.convex.mutation(api.tokens.store, { hash: hashToken(token), name });

		return { token };
	},

	revoke: async ({ locals, request }) => {
		const data = await request.formData();
		const tokenId = String(data.get('tokenId') ?? '');

		if (!tokenId) return fail(400, { message: 'Missing token.' });

		await locals.convex.mutation(api.tokens.revoke, { tokenId: tokenId as never });
	},

	// posted from the account menu, which is on every page
	setHideEmail: async ({ locals, request }) => {
		const data = await request.formData();

		await locals.convex.mutation(api.preferences.setHideEmail, {
			hideEmail: data.get('hideEmail') === 'true'
		});
	}
};
