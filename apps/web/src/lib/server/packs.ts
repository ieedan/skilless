import { fail } from '@sveltejs/kit';
import { ConvexError } from 'convex/values';
import { packAddress } from '$lib/pack';

/**
 * Runs a pack write, turning the reasons Convex refuses one into a form failure
 * the page can show. Anything else is a bug, so it is thrown.
 */
export async function packWrite<T>(write: () => Promise<T>) {
	try {
		return await write();
	} catch (cause) {
		const data = cause instanceof ConvexError ? cause.data : undefined;
		if (data?.code === 'INVALID_PACK') {
			// "Invalid pack: names are limited to…" reads better as "Names are limited to…"
			const reason = String(data.message).replace(/^Invalid pack: /, '');
			return fail(400, { message: reason.charAt(0).toUpperCase() + reason.slice(1) + '.' });
		}
		if (data?.code === 'PACK_NOT_FOUND')
			return fail(404, { message: 'That pack no longer exists.' });
		throw cause;
	}
}

type PackDoc = {
	uuid: string;
	name: string;
	description?: string;
	public?: boolean;
	skills: string[];
	skillCount?: number;
	countPartial?: boolean;
};

/** A pack as the API and MCP hand it out. Never its `_id` or `userId`. */
export function toPack(pack: PackDoc, origin: string) {
	return {
		id: pack.uuid,
		name: pack.name,
		description: pack.description ?? null,
		public: pack.public === true,
		skills: pack.skills,
		skillCount: pack.skillCount ?? pack.skills.length,
		countPartial: pack.skillCount === undefined || pack.countPartial === true,
		url: packAddress(origin, pack.uuid)
	};
}
