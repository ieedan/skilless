import { api } from '@skilless/platform';
import { convexLoad } from 'convex-svelte/sveltekit';

// Live, like the skills list, so a `skilless add` in another terminal shows up
// here without a reload. GitHub descriptions are cached on each project and
// refreshed in the background when stale; the live list picks the result up.
export async function load({ locals }) {
	const [skills, projects, installUrl] = await Promise.all([
		convexLoad(api.skills.list, {}),
		convexLoad(api.projects.list, {}),
		locals.convex.query(api.github.installLink, {}),
		// only queues the lookup, so this never waits on GitHub
		locals.convex.mutation(api.github.refreshStale, {}).catch(() => {})
	]);

	// Every repo the GitHub app can see, for the ones without skills yet. Streamed,
	// so the list renders without waiting on GitHub; empty when signed in some
	// other way or the lookup fails.
	const repos = locals.convex
		.action(api.github.repos, {})
		.then(({ repos }) => repos)
		.catch(() => []);

	return { skills, projects, installUrl, repos };
}

export const actions = {
	remove: async ({ locals, request }) => {
		const data = await request.formData();
		await locals.convex.mutation(api.projects.remove, {
			projectId: String(data.get('projectId')) as never
		});
	}
};
