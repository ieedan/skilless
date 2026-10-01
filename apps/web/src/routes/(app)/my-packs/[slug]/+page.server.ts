import { api } from '@skilless/platform';
import { error, redirect } from '@sveltejs/kit';
import { convexLoad } from 'convex-svelte/sveltekit';
import { packWrite } from '$lib/server/packs';

// Live, so a change made in another tab, or an entry's skill made public, shows straight away.
export async function load({ params }) {
	const [view, skills, packs] = await Promise.all([
		convexLoad(api.packs.mine, { slug: params.slug }),
		convexLoad(api.skills.list, {}),
		convexLoad(api.packs.list, {})
	]);
	// someone else's pack, even a public one, is read on its own page
	if (!view.data?.mine) error(404, 'No pack of yours by that address');

	return { view, skills, packs };
}

export const actions = {
	rename: async ({ locals, params, request }) => {
		const data = await request.formData();
		return await packWrite(() =>
			locals.convex.mutation(api.packs.rename, {
				slug: params.slug,
				name: String(data.get('name') ?? ''),
				description: String(data.get('description') ?? '')
			})
		);
	},

	setPublic: async ({ locals, params, request }) => {
		const data = await request.formData();
		return await packWrite(() =>
			locals.convex.mutation(api.packs.setPublic, {
				slug: params.slug,
				public: data.get('public') === 'true'
			})
		);
	},

	/** Any source, as typed: one per line, so several can be pasted at once. */
	addEntries: async ({ locals, params, request }) => {
		const data = await request.formData();
		const entries = String(data.get('entries') ?? '')
			.split(/\r?\n/)
			.map((entry) => entry.trim())
			.filter(Boolean);
		return await packWrite(() =>
			locals.convex.mutation(api.packs.addEntries, { slug: params.slug, entries })
		);
	},

	removeEntry: async ({ locals, params, request }) => {
		const data = await request.formData();
		return await packWrite(() =>
			locals.convex.mutation(api.packs.removeEntry, {
				slug: params.slug,
				entry: String(data.get('entry'))
			})
		);
	},

	remove: async ({ locals, params }) => {
		await packWrite(() => locals.convex.mutation(api.packs.remove, { slug: params.slug }));
		redirect(303, '/my-packs');
	}
};
