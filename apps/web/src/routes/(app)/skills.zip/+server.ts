import { api } from '@skilless/platform';
import { fetchFiles } from '@skilless/platform/client';
import { error, redirect } from '@sveltejs/kit';
import { strToU8, zipSync } from 'fflate';

/**
 * Skills as a zip, `<skill>/<path>` inside: every skill for a quick backup, or
 * just one with `?name=`.
 *
 * Lives at /skills.zip rather than under /skills/ so it can never shadow a
 * skill that happens to share its name.
 */
export async function GET({ locals, url }) {
	if (!locals.token) redirect(303, '/login');

	const name = url.searchParams.get('name');

	let skills;
	if (name) {
		const files = await locals.convex.query(api.links.read, { name });
		if (!files) error(404, 'No skill by that name');
		skills = [{ name, files }];
	} else {
		skills = await locals.convex.query(api.links.readAll, {});
	}

	const entries: Record<string, Uint8Array> = {};
	await Promise.all(
		skills.map(async (skill) => {
			for (const file of await fetchFiles(skill.files)) {
				entries[`${skill.name}/${file.path}`] = strToU8(file.contents);
			}
		})
	);

	const filename = name ?? `skills-${new Date().toISOString().slice(0, 10)}`;

	return new Response(zipSync(entries), {
		headers: {
			'Content-Type': 'application/zip',
			'Content-Disposition': `attachment; filename="${filename}.zip"`
		}
	});
}
