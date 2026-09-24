import type { ParamMatcher } from '@sveltejs/kit';

/** A docs path asking for the page's markdown, like `cli.md` or `cloud/sync.md`. */
export const match = ((param) => param.endsWith('.md')) satisfies ParamMatcher;
