import { api } from '@skilless/platform';
import { convexLoad } from 'convex-svelte/sveltekit';

// Live, like the skills list, so a `skilless add` in another terminal shows up
// here without a reload. GitHub descriptions are cached on each project and
// refreshed in the background when stale; the live list picks the result up.
export async function load({ locals }) {
	const [skills, projects, installUrl, repos] = await Promise.all([
		convexLoad(api.skills.list, {}),
		convexLoad(api.projects.list, {}),
		locals.convex.query(api.github.installLink, {}),
		// Every repo the GitHub app can see, cached, for the ones without skills
		// yet. The page subscribes to it itself; this just seeds the first render.
		locals.convex.query(api.github.cachedRepos, {}).catch(() => undefined),
		// these only queue lookups, so this never waits on GitHub. The repo list
		// is filled the first time only; after that a search looks again.
		locals.convex.mutation(api.github.refreshStale, {}).catch(() => {}),
		locals.convex.mutation(api.github.syncRepos, { force: false }).catch(() => {})
	]);

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
