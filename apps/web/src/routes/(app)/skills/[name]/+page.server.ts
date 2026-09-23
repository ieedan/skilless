import { api } from '@skilless/platform';
import { error, redirect } from '@sveltejs/kit';
import { convexLoad } from 'convex-svelte/sveltekit';
import { deleteSkillPath, readContents } from '$lib/server/skill-files';

export async function load({ locals, params }) {
	// Live, like the skills list, so the menu's project toggles show without a
	// reload. The row carries the frontmatter and file paths, so nothing here
	// reads a file.
	const [skill, projects] = await Promise.all([
		convexLoad(api.skills.get, { name: params.name }),
		convexLoad(api.projects.list, {})
	]);
	if (!skill.data) error(404, 'No skill by that name');

	return { skill, projects, contents: readContents(locals, params.name) };
}

export const actions = {
	deletePath: (event) => deleteSkillPath(event, {}),

	unbind: async ({ locals, request }) => {
		const data = await request.formData();

		await locals.convex.mutation(api.projects.unbind, {
			projectId: String(data.get('projectId')) as never,
			skillId: String(data.get('skillId')) as never
		});
	},

	toggleGlobal: async ({ locals, params, request }) => {
		const data = await request.formData();

		await locals.convex.mutation(api.skills.setGlobal, {
			name: params.name,
			global: data.get('global') === 'true'
		});
	},

	remove: async ({ locals, params }) => {
		await locals.convex.mutation(api.skills.remove, { name: params.name });
		redirect(303, '/skills');
	}
};
