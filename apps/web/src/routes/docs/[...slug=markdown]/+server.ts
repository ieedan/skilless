import { getMarkdown, markdownResponse } from '$lib/docs';

// `/docs/cli.md` is the markdown of `/docs/cli`; `/docs/index.md` is the docs home
export const GET = async ({ params }) => {
	const slug = params.slug.replace(/\.md$/, '');
	return markdownResponse(await getMarkdown(slug === 'index' ? '' : slug));
};
