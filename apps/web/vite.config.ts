import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	// Vite only exposes VITE_ on `import.meta.env` by default. SvelteKit's own
	// PUBLIC_ prefix is a different setting and does not cover it, so without
	// this `import.meta.env.PUBLIC_CONVEX_URL` is undefined even though dotenvx
	// put it in process.env.
	envPrefix: ['PUBLIC_'],
	optimizeDeps: {
		// the workspace package ships TypeScript source rather than a build
		exclude: ['@skilless/platform'],
		/*
		 * The editor loads its grammar with a dynamic import keyed on the file
		 * extension, so Vite cannot see these at startup. It discovers one the
		 * first time you open, say, a .ts file, re-optimizes, and the import
		 * already in flight 404s:
		 *   Failed to fetch dynamically imported module: @codemirror_lang-javascript
		 * Pre-bundling them up front means there is nothing left to discover.
		 */
		include: [
			'@codemirror/lang-javascript',
			'@codemirror/lang-json',
			'@codemirror/lang-markdown',
			'@codemirror/lang-yaml'
		]
	},
	ssr: {
		noExternal: ['@skilless/platform']
	}
});
