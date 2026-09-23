import { api } from '@skilless/platform';
import { error } from '@sveltejs/kit';
import { convexLoad } from 'convex-svelte/sveltekit';

export async function load({ locals, params }) {
	const [skills, projects] = await Promise.all([
		convexLoad(api.skills.list, {}),
		convexLoad(api.projects.list, {})
	]);

	if (!projects.data?.some((project) => project.key === params.key)) {
		error(404, 'No project by that name');
	}

	return {
		skills,
		projects,
		// streamed, see the project list
		description: locals.convex
			.action(api.github.describe, { keys: [params.key] })
			.then((descriptions) => descriptions[params.key] ?? null)
			.catch(() => null)
	};
}
