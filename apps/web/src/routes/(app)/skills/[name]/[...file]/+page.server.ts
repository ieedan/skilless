import { api } from '@skilless/platform';
import { error, fail } from '@sveltejs/kit';
import { ConvexError } from 'convex/values';
import { containsNul } from '$lib/server/hash';
import { isDirectory, listDirectory } from '$lib/files';
import { deleteSkillPath, readContents } from '$lib/server/skill-files';

export async function load({ locals, params }) {
	const skill = await locals.convex.query(api.skills.get, { name: params.name });
	if (!skill) error(404, 'No skill by that name');

	// The same catch-all serves files and directories, because a breadcrumb built
	// from a path like `agents/openai.yaml` links to every level of it.
	if (!skill.files.some((candidate) => candidate.path === params.file)) {
		if (!isDirectory(skill.files, params.file)) error(404, 'No file by that name');

		return {
			skill: { name: skill.name },
			directory: {
				path: params.file,
				entries: listDirectory(skill.files, params.file),
				contents: readContents(locals, skill.name)
			},
			file: undefined
		};
	}

	// Streamed rather than awaited, so the editor opens straight away and shows
	// a loading state while just this file comes down from R2.
	const path = params.file;
	const contents = readContents(locals, skill.name, [path]).then((files) => {
		if (files[path] === undefined) throw new Error('That file is no longer part of the skill.');
		return files[path];
	});

	return {
		skill: { name: skill.name },
		directory: undefined,
		file: { path, contents }
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

		// no lookup first: the action checks the skill and the file exist anyway
		try {
			await locals.convex.action(api.files.writeFile, {
				name: params.name,
				path: params.file,
				contents
			});
		} catch (cause) {
			const code = cause instanceof ConvexError ? cause.data?.code : undefined;
			if (code === 'SKILL_NOT_FOUND') return fail(404, { message: 'No skill by that name.' });
			if (code === 'SKILL_FILE_NOT_FOUND') {
				return fail(404, { message: 'That file is no longer part of the skill.' });
			}
			throw cause;
		}

		return { saved: true };
	}
};
