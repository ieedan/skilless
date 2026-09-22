import { api } from '@skilless/platform';
import { error, redirect } from '@sveltejs/kit';
import { listDirectory } from '$lib/files';
import { deleteSkillPath } from '$lib/server/skill-files';

export async function load({ locals, params }) {
	const skill = await locals.convex.query(api.skills.get, { name: params.name });
	if (!skill) error(404, 'No skill by that name');

	// Always the file list, even for a one-file skill: this is where the skill
	// crumb points, and bouncing you back to the file you came from would make
	// that crumb dead. The skills list links straight at the file instead, so
	// getting there is still one request.
	return {
		skill: { name: skill.name },
		entries: listDirectory(skill.files)
	};
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
