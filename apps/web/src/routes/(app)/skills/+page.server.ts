import { api } from '@skilless/platform';
import { fail, redirect } from '@sveltejs/kit';
import { hashFiles } from '$lib/server/hash';
import { isValidName, NAME_RULES, scaffold } from '$lib/skill';

export async function load({ locals }) {
	return { skills: await locals.convex.query(api.skills.list, {}) };
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

		await locals.convex.mutation(api.skills.create, {
			name,
			files,
			contentHash: hashFiles(files),
			editedAt: Date.now()
		});

		// straight into the editor — the whole point of creating one is to write it
		redirect(303, `/skills/${encodeURIComponent(name)}/${files[0].path}`);
	},

	remove: async ({ locals, request }) => {
		const data = await request.formData();
		// Soft delete: the row is kept for 30 days, but nothing in the UI or the
		// CLI can bring it back, so treat it as final when talking to the user.
		await locals.convex.mutation(api.skills.remove, { name: String(data.get('name')) });
	}
};
