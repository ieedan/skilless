import { api } from '@skilless/platform';
import { redirect } from '@sveltejs/kit';

/**
 * Where sign-in lands before the page it was headed for, and the GitHub App's
 * Setup URL. Signing in only authorizes the app, so a user who has not installed
 * it anywhere is sent on to install it, with their destination carried through
 * GitHub as `state`. GitHub then returns here with `setup_action`, and we finish
 * the trip.
 */
export async function GET({ locals, url }) {
	const fromGithub = url.searchParams.has('setup_action');
	const to = safePath(url.searchParams.get(fromGithub ? 'state' : 'redirectTo'));

	if (fromGithub) redirect(302, to);
	if (!locals.token) redirect(302, `/login?redirectTo=${encodeURIComponent(to)}`);

	// never hold up sign-in on this: if GitHub is down they can install later
	const installation = await locals.convex.action(api.github.installation, {}).catch(() => null);

	if (installation && !installation.installed) {
		redirect(302, `${installation.installUrl}?state=${encodeURIComponent(to)}`);
	}

	redirect(302, to);
}

/** Only same-site paths, so neither query string can bounce the user off-site. */
function safePath(path: string | null): string {
	if (!path || !path.startsWith('/') || path.startsWith('//') || path.startsWith('/\\')) {
		return '/my-skills';
	}
	return path;
}
