import { defineConfig } from 'mdsx';
import rehypePrettyCode from 'rehype-pretty-code';
import rehypeSlug from 'rehype-slug';
import remarkGfm from 'remark-gfm';

/**
 * Markdown for the docs, compiled to Svelte components the way shadcn-svelte
 * does it: GitHub flavoured markdown, ids on every heading for the table of
 * contents, and code highlighted at build time in both themes.
 */
export default defineConfig({
	extensions: ['.md'],
	remarkPlugins: [remarkGfm],
	rehypePlugins: [
		rehypeSlug,
		[
			rehypePrettyCode,
			{
				// both themes are emitted as CSS variables and picked by layout.css
				theme: { light: 'github-light', dark: 'github-dark' },
				keepBackground: false,
				defaultLang: { block: 'plaintext' }
			}
		]
	],
	blueprints: {
		default: { path: 'src/lib/components/docs/blueprint.svelte' }
	}
});
