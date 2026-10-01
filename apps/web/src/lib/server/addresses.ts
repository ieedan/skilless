import { api } from '@skilless/platform';
import { fetchFiles } from '@skilless/platform/client';
import { error, json, type RequestEvent } from '@sveltejs/kit';
import { authenticate } from './auth';

/*
 * Skills and packs at their addresses. A skill at `/skills/<uuid>` is a page to
 * a browser asking for HTML and JSON to anything else — the CLI. A pack's JSON
 * is its own file, `/packs/<uuid>.json`, read like any pack someone hosts. Public ones are anyone's to read; private
 * ones only their owner's, signed in by cookie or by a CLI bearer token.
 */

/**
 * Looks something up as whoever is asking: the bearer token's user when there
 * is one, else the cookie's, else nobody.
 */
async function asViewer<T>(
	event: RequestEvent,
	byToken: (auth: NonNullable<Awaited<ReturnType<typeof authenticate>>>) => Promise<T>,
	byCookie: () => Promise<T>
): Promise<T | null> {
	const header = event.request.headers.get('authorization') ?? undefined;
	if (header) {
		const auth = await authenticate(header);
		// a bad token is not quietly treated as nobody: say so, so `skilless auth` gets suggested
		if (!auth) error(401, 'That token is not valid.');
		return await byToken(auth);
	}
	return await byCookie();
}

export async function viewSkill(event: RequestEvent, uuid: string) {
	return await asViewer(
		event,
		(auth) => auth.convex.query(api.skills.viewFor, { uuid, viewerId: auth.userId }),
		() => event.locals.convex.query(api.skills.view, { uuid })
	);
}

export async function viewPack(event: RequestEvent, uuid: string) {
	return await asViewer(
		event,
		(auth) => auth.convex.query(api.packs.viewFor, { uuid, viewerId: auth.userId }),
		() => event.locals.convex.query(api.packs.view, { uuid })
	);
}

type SkillView = NonNullable<Awaited<ReturnType<typeof viewSkill>>>;
type PackView = NonNullable<Awaited<ReturnType<typeof viewPack>>>;

/** A skill as `skilless add <address>` reads it. */
export async function skillJson(view: SkillView) {
	return {
		name: view.skill.name,
		title: view.skill.title,
		description: view.skill.description,
		contentHash: view.skill.contentHash,
		public: view.skill.public === true,
		files: await fetchFiles(view.files)
	};
}

/** A pack as `skilless add <address>` reads it — the same shape as a pack file. */
export function packJson(view: PackView, origin: string) {
	return {
		$schema: `${origin}/schema/pack.json`,
		name: view.pack.name,
		...(view.pack.description ? { description: view.pack.description } : {}),
		skills: view.pack.skills
	};
}

/**
 * Who can see it decides how it may be cached: a private one must never be
 * kept by anything between its owner and here.
 */
export function cacheHeaders(isPublic: boolean): Record<string, string> {
	return {
		'cache-control': isPublic ? 'public, max-age=60' : 'private, no-store',
		vary: 'authorization, cookie'
	};
}

/**
 * A pack's JSON, served at `/packs/<uuid>.json` and `/my-packs/<uuid>.json`:
 * what `skilless add` reads, and what anyone writing a pack by hand would serve.
 */
export async function packFile(event: RequestEvent & { params: { id: string } }) {
	const view = await viewPack(event, event.params.id);
	if (!view) return json(NOT_FOUND, { status: 404, headers: cacheHeaders(false) });

	return json(packJson(view, event.url.origin), {
		headers: cacheHeaders(view.pack.public === true)
	});
}

export const NOT_FOUND = {
	error: 'not_found',
	message: 'Nothing is at that address, or it is private.'
};
