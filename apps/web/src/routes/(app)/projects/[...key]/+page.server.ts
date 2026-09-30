import { api } from '@skilless/platform';
import { error } from '@sveltejs/kit';
import { convexLoad } from 'convex-svelte/sveltekit';

export async function load({ locals, params }) {
	const [skills, projects, installUrl, repos] = await Promise.all([
		convexLoad(api.skills.list, {}),
		convexLoad(api.projects.list, {}),
		// the description refresh is queued by the page, see the project list
		locals.convex.query(api.github.installLink, {}),
		// a repo with no skills yet has a page too, off the cached repo list
		locals.convex.query(api.github.cachedRepos, {}).catch(() => undefined)
	]);

	const known =
		projects.data?.some((project) => project.key === params.key) ||
		repos?.repos.some((repo) => repo.key === params.key);
	if (!known) error(404, 'No project by that name');

	return { skills, projects, installUrl, repos };
}
