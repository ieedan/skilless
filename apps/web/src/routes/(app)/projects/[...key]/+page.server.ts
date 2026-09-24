import { api } from '@skilless/platform';
import { error } from '@sveltejs/kit';
import { convexLoad } from 'convex-svelte/sveltekit';

export async function load({ locals, params }) {
	const [skills, projects, installUrl] = await Promise.all([
		convexLoad(api.skills.list, {}),
		convexLoad(api.projects.list, {}),
		locals.convex.query(api.github.installLink, {}),
		// see the project list
		locals.convex.mutation(api.github.refreshStale, {}).catch(() => {})
	]);

	if (!projects.data?.some((project) => project.key === params.key)) {
		error(404, 'No project by that name');
	}

	return { skills, projects, installUrl };
}
