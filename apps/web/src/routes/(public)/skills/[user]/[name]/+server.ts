import { json } from '@sveltejs/kit';
import { cacheHeaders, NOT_FOUND, skillJson, viewSkill } from '$lib/server/addresses';
import { supportsBinary, updateMessage, withBinary } from '$lib/server/clients';
import { countInstall, isAdd } from '$lib/server/installs';

/** The skill as JSON, for `skilless add`. A browser asking for HTML gets `+page.svelte` instead. */
export async function GET(event) {
	const view = await viewSkill(event, event.params.user, event.params.name);
	if (!view) return json(NOT_FOUND, { status: 404, headers: cacheHeaders(false) });

	// an older CLI would write a binary file out as base64 text, so it is told to update
	const binary = withBinary([{ name: view.skill.name, files: view.files }]);
	if (binary.length > 0 && !supportsBinary(event.request.headers)) {
		return json(
			{ error: 'upgrade_required', message: updateMessage(binary) },
			{ status: 426, headers: { 'Cache-Control': 'no-store', Vary: 'X-Skilless-Features' } }
		);
	}

	const adding = isAdd(event.request.headers);
	if (adding) await countInstall('skill', event.params.user, view.skill.name);

	return json(await skillJson(view), {
		headers: cacheHeaders(view.skill.public === true, adding)
	});
}
