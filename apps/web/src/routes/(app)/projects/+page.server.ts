import { api } from '@skilless/platform';
import { convexLoad } from 'convex-svelte/sveltekit';

// Live, like the skills list, so a `skilless add` in another terminal shows up
// here without a reload. GitHub descriptions and the repo list are cached, and
// the page queues their refresh once it is up (see +page.svelte): mutations are
// slow enough that waiting on them here held up the navigation.
export async function load({ locals }) {
	const [skills, projects, installUrl, repos] = await Promise.all([
		convexLoad(api.skills.list, {}),
		convexLoad(api.projects.list, {}),
		locals.convex.query(api.github.installLink, {}),
		// Every repo the GitHub app can see, cached, for the ones without skills
		// yet. The page subscribes to it itself; this just seeds the first render.
		locals.convex.query(api.github.cachedRepos, {}).catch(() => undefined)
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
