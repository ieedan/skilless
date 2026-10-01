import { redirect } from '@sveltejs/kit';

export function load({ locals }) {
	// Signed-in visitors land in the app. The marketing page stays reachable for
	// them at /home rather than being hidden once they have an account.
	if (locals.token) redirect(302, '/my-skills');
}
