import { api } from '@skilless/platform';

/** Public skills, ranked: `?sort=trending` for the last 24 hours, `?q=` to search. */
export async function load({ locals, url }) {
	const param = url.searchParams.get('sort');
	// `hot` (this hour against the last) comes later, from the same hourly counts
	const sort = param === 'trending' ? param : 'all';
	const search = url.searchParams.get('q')?.trim() ?? '';

	const rows = await locals.convex.query(api.installs.browse, {
		kind: 'skill',
		window: sort === 'trending' ? 'day' : 'all',
		...(search ? { search } : {})
	});

	return { sort, search, rows } as const;
}
