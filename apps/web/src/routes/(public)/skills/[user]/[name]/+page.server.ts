import { fetchFiles } from '@skilless/platform/client';
import { api } from '@skilless/platform';
import { error } from '@sveltejs/kit';
import { viewSkill } from '$lib/server/addresses';
import { cliAddress } from '$lib/pack';

export async function load(event) {
	const view = await viewSkill(event, event.params.user, event.params.name);
	if (!view) error(404, 'Nothing is at that address, or it is private.');

	// skills are capped at 3MB, so every text file comes down with the page; a
	// binary one is shown from its own URL rather than carried through as base64
	const text = await fetchFiles(view.files.filter((link) => !link.binary));
	const binary = view.files
		.filter((link) => link.binary)
		.map((link) => ({ path: link.path, binary: { url: link.url, size: link.size ?? null } }));
	const files: (
		{ path: string; contents: string; binary?: undefined } | (typeof binary)[number]
	)[] = [...text, ...binary].sort((a, b) =>
		a.path === 'SKILL.md' ? -1 : b.path === 'SKILL.md' ? 1 : a.path.localeCompare(b.path)
	);

	// whether the button says Add or Added; only asked of someone signed in looking at another's skill
	const added =
		event.locals.token && !view.mine
			? await event.locals.convex.query(api.skills.added, {
					username: event.params.user,
					name: view.skill.name
				})
			: false;

	return {
		added,
		skill: {
			name: view.skill.name,
			title: view.skill.title,
			description: view.skill.description,
			metadata: view.skill.metadata,
			public: view.skill.public === true
		},
		owner: view.owner,
		mine: view.mine,
		files,
		// what to type after `skilless add`
		address: cliAddress({
			kind: 'skill',
			username: event.params.user.toLowerCase(),
			name: view.skill.name
		})
	};
}
