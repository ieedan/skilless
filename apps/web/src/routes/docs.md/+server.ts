import { getMarkdown, markdownResponse } from '$lib/docs';

// the docs home as markdown: `/docs` → `/docs.md`
export const GET = async () => markdownResponse(await getMarkdown(''));
