<script lang="ts" module>
	/**
	 * File-type icons, drawn from Remix Icon so the app keeps a single icon set.
	 * Colour is what carries the type at a glance; the glyph only has to be
	 * plausible, since a skill directory is nearly all markdown.
	 */
	type IconSpec = { icon: string; class: string };

	const BY_EXTENSION: Record<string, IconSpec> = {
		md: { icon: 'ri-markdown-fill', class: 'text-sky-400' },
		mdx: { icon: 'ri-markdown-fill', class: 'text-sky-400' },
		ts: { icon: 'ri-file-code-fill', class: 'text-blue-400' },
		tsx: { icon: 'ri-file-code-fill', class: 'text-blue-400' },
		js: { icon: 'ri-javascript-fill', class: 'text-yellow-400' },
		mjs: { icon: 'ri-javascript-fill', class: 'text-yellow-400' },
		cjs: { icon: 'ri-javascript-fill', class: 'text-yellow-400' },
		json: { icon: 'ri-braces-fill', class: 'text-amber-400' },
		yml: { icon: 'ri-file-settings-fill', class: 'text-rose-400' },
		yaml: { icon: 'ri-file-settings-fill', class: 'text-rose-400' },
		toml: { icon: 'ri-file-settings-fill', class: 'text-rose-400' },
		sh: { icon: 'ri-terminal-box-fill', class: 'text-emerald-400' },
		bash: { icon: 'ri-terminal-box-fill', class: 'text-emerald-400' },
		py: { icon: 'ri-file-code-fill', class: 'text-emerald-400' },
		css: { icon: 'ri-css3-fill', class: 'text-indigo-400' },
		html: { icon: 'ri-html5-fill', class: 'text-orange-400' },
		svelte: { icon: 'ri-file-code-fill', class: 'text-orange-400' },
		png: { icon: 'ri-image-fill', class: 'text-fuchsia-400' },
		jpg: { icon: 'ri-image-fill', class: 'text-fuchsia-400' },
		jpeg: { icon: 'ri-image-fill', class: 'text-fuchsia-400' },
		svg: { icon: 'ri-shapes-fill', class: 'text-fuchsia-400' }
	};

	const FALLBACK: IconSpec = { icon: 'ri-file-3-fill', class: 'text-muted-foreground' };

	export function iconFor(path: string): IconSpec {
		const extension = path.split('.').pop()?.toLowerCase() ?? '';
		return BY_EXTENSION[extension] ?? FALLBACK;
	}
</script>

<script lang="ts">
	let { path, class: className = 'text-base' }: { path: string; class?: string } = $props();

	const spec = $derived(iconFor(path));
</script>

<i class="{spec.icon} {spec.class} {className} shrink-0 leading-none" aria-hidden="true"></i>
