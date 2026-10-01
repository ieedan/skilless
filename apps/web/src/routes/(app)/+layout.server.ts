import { api } from '@skilless/platform';
import { redirect } from '@sveltejs/kit';
import { toAppUser } from '$lib/user';

export async function load({ locals, url, depends }) {
	if (!locals.token) {
		redirect(302, `/login?redirectTo=${encodeURIComponent(url.pathname)}`);
	}

	// the account menu reloads just this after changing a preference
	depends('app:preferences');

	const [user, preferences, profile] = await Promise.all([
		locals.convex.query(api.auth.getCurrentUser, {}),
		locals.convex.query(api.preferences.get, {}),
		locals.convex.query(api.profiles.me, {})
	]);

	// signed in before usernames existed: look the GitHub login up once, now
	const username =
		profile?.username ?? (await locals.convex.action(api.profiles.ensure, {}).catch(() => null));

	return { user: toAppUser(user, preferences), preferences, username };
}
