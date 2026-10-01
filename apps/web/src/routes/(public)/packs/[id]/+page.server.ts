import { error } from '@sveltejs/kit';
import { viewPack } from '$lib/server/addresses';
import { packAddress, shortAddress, skillCount } from '$lib/pack';

export async function load(event) {
	const view = await viewPack(event, event.params.id);
	if (!view) error(404, 'Nothing is at that address, or it is private.');

	return {
		pack: {
			uuid: view.pack.uuid,
			name: view.pack.name,
			description: view.pack.description,
			public: view.pack.public === true,
			count: skillCount(view.pack)
		},
		entries: view.entries,
		owner: view.owner,
		mine: view.mine,
		address: shortAddress(packAddress(event.url.origin, view.pack.uuid))
	};
}
