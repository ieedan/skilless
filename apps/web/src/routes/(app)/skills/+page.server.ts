import { api } from '@skilless/platform';
import { fail, redirect } from '@sveltejs/kit';
import { convexLoad } from 'convex-svelte/sveltekit';
import { isValidName, NAME_RULES, scaffold } from '$lib/skill';

// Live: the transport hook turns these into subscriptions on the client, so
// changes from the CLI or another tab show up without a reload.
export async function load() {
	const [skills, projects] = await Promise.all([
		convexLoad(api.skills.list, {}),
		convexLoad(api.projects.list, {})
	]);

	return { skills, projects };
}

export const actions = {
	create: async ({ locals, request }) => {
		const data = await request.formData();
		const name = String(data.get('name') ?? '').trim();
		const description = String(data.get('description') ?? '').trim();

		if (!name) return fail(400, { name, description, message: 'A name is required.' });
		if (!isValidName(name)) return fail(400, { name, description, message: NAME_RULES });
		if (!description) {
			return fail(400, { name, description, message: 'A description is required.' });
		}

		const taken = await locals.convex.query(api.skills.get, { name });
		if (taken) {
			return fail(409, {
				name,
				description,
				message: `${name} already exists in your library.`
			});
		}

		const files = scaffold(name, description);

		await locals.convex.action(api.files.create, { name, files });

		// straight into the editor — the whole point of creating one is to write it
		redirect(303, `/skills/${encodeURIComponent(name)}/${files[0].path}`);
	},

	setBinding: async ({ locals, request }) => {
		const data = await request.formData();
		const args = {
			projectId: String(data.get('projectId')) as never,
			skillId: String(data.get('skillId')) as never
		};

		await locals.convex.mutation(
			data.get('bound') === 'true' ? api.projects.bind : api.projects.unbind,
			args
		);
	},

	setGlobal: async ({ locals, request }) => {
		const data = await request.formData();

		await locals.convex.mutation(api.skills.setGlobal, {
			name: String(data.get('name')),
			global: data.get('global') === 'true'
		});
	},

	remove: async ({ locals, request }) => {
		const data = await request.formData();
		// Soft delete: the row is kept for 30 days, but nothing in the UI or the
		// CLI can bring it back, so treat it as final when talking to the user.
		await locals.convex.mutation(api.skills.remove, { name: String(data.get('name')) });
	}
};
