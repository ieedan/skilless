import { api } from '@skilless/platform';
import { convexLoad } from 'convex-svelte/sveltekit';

// Live, like the skills list, so a `skilless add` in another terminal shows up
// here without a reload.
export async function load({ locals }) {
	const [skills, projects] = await Promise.all([
		convexLoad(api.skills.list, {}),
		convexLoad(api.projects.list, {})
	]);

	return {
		skills,
		projects,
		/**
		 * Streamed rather than awaited: they come from GitHub, one request per
		 * repo, and the list is useful before they land. Projects added after
		 * this load simply go without until the next one.
		 */
		descriptions: describe(
			locals,
			(projects.data ?? []).map((project) => project.key)
		)
	};
}

function describe(locals: App.Locals, keys: string[]): Promise<Record<string, string | null>> {
	if (keys.length === 0) return Promise.resolve({});
	return locals.convex.action(api.github.describe, { keys }).catch(() => ({}));
}
