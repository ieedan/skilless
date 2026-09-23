import { api } from '@skilless/platform';

export const actions = {
	setHideEmail: async ({ locals, request }) => {
		const data = await request.formData();

		await locals.convex.mutation(api.preferences.setHideEmail, {
			hideEmail: data.get('hideEmail') === 'true'
		});
	}
};
