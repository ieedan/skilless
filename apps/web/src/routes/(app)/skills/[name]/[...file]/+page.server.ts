import { api } from '@skilless/platform';
import { error, fail } from '@sveltejs/kit';
import { containsNul, hashFiles } from '$lib/server/hash';
import { isDirectory, listDirectory } from '$lib/files';
import { deleteSkillPath } from '$lib/server/skill-files';

export async function load({ locals, params }) {
	const skill = await locals.convex.query(api.skills.get, { name: params.name });
	if (!skill) error(404, 'No skill by that name');

	const file = skill.files.find((candidate) => candidate.path === params.file);

	// The same catch-all serves files and directories, because a breadcrumb built
	// from a path like `agents/openai.yaml` links to every level of it.
	if (!file) {
		if (!isDirectory(skill.files, params.file)) error(404, 'No file by that name');

		return {
			skill: { name: skill.name },
			directory: { path: params.file, entries: listDirectory(skill.files, params.file) },
			file: undefined
		};
	}

	return {
		skill: { name: skill.name },
		directory: undefined,
		file: { path: file.path, contents: file.contents }
	};
}

export const actions = {
	deletePath: (event) => deleteSkillPath(event, { currentDirectory: String(event.params.file) }),

	save: async ({ locals, params, request }) => {
		const data = await request.formData();
		const contents = String(data.get('contents') ?? '');

		// the CLI writes these to disk, so keep the same constraint it enforces
		if (containsNul(contents)) {
			return fail(400, { message: 'That file contains a NUL byte and cannot be saved.' });
		}

		const skill = await locals.convex.query(api.skills.get, { name: params.name });
		if (!skill) return fail(404, { message: 'No skill by that name.' });
		if (!skill.files.some((file) => file.path === params.file)) {
			return fail(404, { message: 'That file is no longer part of the skill.' });
		}

		// hash the whole set, as the CLI does — the browser never supplies it
		const next = skill.files.map((file) =>
			file.path === params.file ? { ...file, contents } : file
		);

		await locals.convex.mutation(api.skills.writeFile, {
			name: params.name,
			path: params.file,
			contents,
			contentHash: hashFiles(next),
			editedAt: Date.now()
		});

		return { saved: true };
	}
};
