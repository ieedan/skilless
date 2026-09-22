import { api } from '@skilless/platform';
import { redirect } from '@sveltejs/kit';
import { hashToken, mintToken } from '$lib/server/hash';

export function load({ locals, url }) {
	if (!locals.token) {
		redirect(302, `/login?redirectTo=${encodeURIComponent(url.pathname + url.search)}`);
	}

	const port = Number(url.searchParams.get('port'));
	const state = url.searchParams.get('state');

	return {
		port: Number.isInteger(port) && port > 0 ? port : null,
		state
	};
}

export const actions = {
	authorize: async ({ locals }) => {
		const token = mintToken();

		await locals.convex.mutation(api.tokens.store, {
			hash: hashToken(token),
			name: 'skilless CLI'
		});

		return { token };
	}
};
