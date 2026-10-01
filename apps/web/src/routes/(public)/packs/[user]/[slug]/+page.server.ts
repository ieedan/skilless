import { error } from '@sveltejs/kit';
import { viewPack } from '$lib/server/addresses';
import { cliAddress, skillCount } from '$lib/pack';

export async function load(event) {
	const view = await viewPack(event, event.params.user, event.params.slug);
	if (!view) error(404, 'Nothing is at that address, or it is private.');

	return {
		pack: {
			slug: view.pack.slug,
			name: view.pack.name,
			description: view.pack.description,
			public: view.pack.public === true,
			count: skillCount(view.pack)
		},
		entries: view.entries,
		owner: view.owner,
		mine: view.mine,
		// what to type after `skilless add`
		address: cliAddress({
			kind: 'pack',
			username: event.params.user.toLowerCase(),
			slug: view.pack.slug
		})
	};
}
