import { api } from '@skilless/platform';
import { fetchFiles } from '@skilless/platform/client';
import { fail, redirect, type RequestEvent } from '@sveltejs/kit';

/**
 * Contents of a skill's files keyed by path, fetched from R2. The slow part of
 * any skill page, so pages that only list files return this unawaited and let
 * it stream in behind the page; only "Copy contents" waits on it.
 */
export async function readContents(
	locals: App.Locals,
	name: string,
	paths?: string[]
): Promise<Record<string, string>> {
	const links = (await locals.convex.query(api.links.read, { name })) ?? [];
	const wanted = paths ? links.filter((link) => paths.includes(link.path)) : links;
	const files = await fetchFiles(wanted);
	return Object.fromEntries(files.map((file) => [file.path, file.contents]));
}

/**
 * Deletes a file or a whole directory from a skill.
 *
 * Shared by the skill root and the directory view, which are different routes
 * rendering the same list. The guards live here rather than in Convex: the CLI
 * can already upsert any file set it likes, so enforcing them only on the web
 * path would be inconsistent — this is about not letting the UI walk you into a
 * broken skill by accident.
 */
export async function deleteSkillPath(event: RequestEvent, options: { currentDirectory?: string }) {
	const { locals, params, request } = event;
	const name = String(params.name);

	const data = await request.formData();
	const path = String(data.get('path') ?? '');
	if (!path) return fail(400, { message: 'Nothing to delete.' });

	const skill = await locals.convex.query(api.skills.get, { name });
	if (!skill) return fail(404, { message: 'No skill by that name.' });

	const prefix = `${path}/`;
	const doomed = skill.files.filter((file) => file.path === path || file.path.startsWith(prefix));
	if (doomed.length === 0)
		return fail(404, { message: 'That file is no longer part of the skill.' });

	if (doomed.some((file) => file.path === 'SKILL.md')) {
		return fail(400, { message: 'SKILL.md defines the skill and cannot be deleted.' });
	}

	const remaining = skill.files.filter((file) => !doomed.includes(file));
	if (remaining.length === 0) {
		return fail(400, { message: 'A skill needs at least one file. Delete the skill instead.' });
	}

	await locals.convex.action(api.files.deletePath, { name, path });

	// If the folder we are looking at just lost its last file it no longer
	// resolves, so fall back to the skill root rather than 404 on reload.
	const directory = options.currentDirectory;
	if (directory && !remaining.some((file) => file.path.startsWith(`${directory}/`))) {
		redirect(303, `/skills/${encodeURIComponent(name)}`);
	}

	return { deleted: doomed.length };
}
