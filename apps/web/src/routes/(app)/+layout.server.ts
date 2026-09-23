import { api } from '@skilless/platform';
import { redirect } from '@sveltejs/kit';
import { toAppUser } from '$lib/user';

export async function load({ locals, url }) {
	if (!locals.token) {
		redirect(302, `/login?redirectTo=${encodeURIComponent(url.pathname)}`);
	}

	const [user, preferences] = await Promise.all([
		locals.convex.query(api.auth.getCurrentUser, {}),
		locals.convex.query(api.preferences.get, {})
	]);

	return { user: toAppUser(user, preferences), preferences };
}
