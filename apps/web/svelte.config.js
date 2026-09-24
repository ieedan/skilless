import adapter from '@sveltejs/adapter-auto';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { mdsx } from 'mdsx';
import mdsxConfig from './mdsx.config.js';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// docs pages are markdown, compiled by mdsx into ordinary components
	extensions: ['.svelte', '.md'],
	preprocess: [mdsx(mdsxConfig), vitePreprocess()],
	kit: {
		adapter: adapter()
	},
	vitePlugin: {
		/*
		 * The root layout calls setContext() (via createSvelteAuthClient and
		 * setupConvex). Svelte's dev-only HMR proxy invokes a component from
		 * inside an effect, where there is no component context, so those calls
		 * throw `lifecycle_outside_component` — which aborts hydration and leaves
		 * the whole app non-interactive in `pnpm dev`. Production is unaffected,
		 * as it has no HMR wrapper.
		 *
		 * Opting this one file out keeps hot reload everywhere else.
		 */
		dynamicCompileOptions({ filename }) {
			if (filename.replace(/\\/g, '/').endsWith('src/routes/+layout.svelte')) {
				return { hmr: false };
			}
		}
	}
};

export default config;
