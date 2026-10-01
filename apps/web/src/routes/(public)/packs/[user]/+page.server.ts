import { api } from '@skilless/platform';
import { error } from '@sveltejs/kit';

/** Someone's public page, open on their packs. */
export async function load({ locals, params }) {
	const user = await locals.convex.query(api.users.page, { username: params.user });
	if (!user) error(404, 'Nobody by that username.');
	return { user, username: params.user.toLowerCase() };
}
