import { api } from '@skilless/platform';
import { fail, redirect } from '@sveltejs/kit';
import { convexLoad } from 'convex-svelte/sveltekit';
import { packWrite } from '$lib/server/packs';

export async function load() {
	return { packs: await convexLoad(api.packs.list, {}) };
}

export const actions = {
	create: async ({ locals, request }) => {
		const data = await request.formData();
		const name = String(data.get('name') ?? '');
		const description = String(data.get('description') ?? '');

		const result = await packWrite(() =>
			locals.convex.mutation(api.packs.create, { name, description })
		);
		// what was typed goes back, so a refusal does not empty the form
		if (typeof result !== 'string')
			return fail(result.status, { ...result.data, name, description });

		// straight in to fill it — an empty pack is no use to anyone
		redirect(303, `/my-packs/${result}`);
	},

	/** For bulk changes from the list; a pack's own page has its own. */
	setPublic: async ({ locals, request }) => {
		const data = await request.formData();
		return await packWrite(() =>
			locals.convex.mutation(api.packs.setPublic, {
				slug: String(data.get('slug')),
				public: data.get('public') === 'true'
			})
		);
	},

	remove: async ({ locals, request }) => {
		const data = await request.formData();
		return await packWrite(() =>
			locals.convex.mutation(api.packs.remove, { slug: String(data.get('slug')) })
		);
	}
};
