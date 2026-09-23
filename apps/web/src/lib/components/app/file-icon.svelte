<script lang="ts" module>
	import type { Component } from 'svelte';
	import type { SVGAttributes } from 'svelte/elements';
	import RiBracesFill from 'remixicon-svelte/icons/braces-fill';
	import RiCss3Fill from 'remixicon-svelte/icons/css3-fill';
	import RiFile3Fill from 'remixicon-svelte/icons/file-3-fill';
	import RiFileCodeFill from 'remixicon-svelte/icons/file-code-fill';
	import RiFileSettingsFill from 'remixicon-svelte/icons/file-settings-fill';
	import RiHtml5Fill from 'remixicon-svelte/icons/html5-fill';
	import RiImageFill from 'remixicon-svelte/icons/image-fill';
	import RiJavascriptFill from 'remixicon-svelte/icons/javascript-fill';
	import RiMarkdownFill from 'remixicon-svelte/icons/markdown-fill';
	import RiShapesFill from 'remixicon-svelte/icons/shapes-fill';
	import RiTerminalBoxFill from 'remixicon-svelte/icons/terminal-box-fill';

	/**
	 * File-type icons, drawn from Remix Icon so the app keeps a single icon set.
	 * Colour is what carries the type at a glance; the glyph only has to be
	 * plausible, since a skill directory is nearly all markdown.
	 */
	export type Icon = Component<SVGAttributes<SVGSVGElement>>;
	type IconSpec = { icon: Icon; class: string };

	const BY_EXTENSION: Record<string, IconSpec> = {
		md: { icon: RiMarkdownFill, class: 'text-sky-400' },
		mdx: { icon: RiMarkdownFill, class: 'text-sky-400' },
		ts: { icon: RiFileCodeFill, class: 'text-blue-400' },
		tsx: { icon: RiFileCodeFill, class: 'text-blue-400' },
		js: { icon: RiJavascriptFill, class: 'text-yellow-500 dark:text-yellow-400' },
		mjs: { icon: RiJavascriptFill, class: 'text-yellow-500 dark:text-yellow-400' },
		cjs: { icon: RiJavascriptFill, class: 'text-yellow-500 dark:text-yellow-400' },
		json: { icon: RiBracesFill, class: 'text-amber-400' },
		yml: { icon: RiFileSettingsFill, class: 'text-rose-400' },
		yaml: { icon: RiFileSettingsFill, class: 'text-rose-400' },
		toml: { icon: RiFileSettingsFill, class: 'text-rose-400' },
		sh: { icon: RiTerminalBoxFill, class: 'text-emerald-400' },
		bash: { icon: RiTerminalBoxFill, class: 'text-emerald-400' },
		py: { icon: RiFileCodeFill, class: 'text-emerald-400' },
		css: { icon: RiCss3Fill, class: 'text-indigo-400' },
		html: { icon: RiHtml5Fill, class: 'text-orange-400' },
		svelte: { icon: RiFileCodeFill, class: 'text-orange-400' },
		png: { icon: RiImageFill, class: 'text-fuchsia-400' },
		jpg: { icon: RiImageFill, class: 'text-fuchsia-400' },
		jpeg: { icon: RiImageFill, class: 'text-fuchsia-400' },
		svg: { icon: RiShapesFill, class: 'text-fuchsia-400' }
	};

	const FALLBACK: IconSpec = { icon: RiFile3Fill, class: 'text-muted-foreground' };

	export function iconFor(path: string): IconSpec {
		const extension = path.split('.').pop()?.toLowerCase() ?? '';
		return BY_EXTENSION[extension] ?? FALLBACK;
	}
</script>

<script lang="ts">
	let { path, class: className = 'size-4' }: { path: string; class?: string } = $props();

	const spec = $derived(iconFor(path));
	const Icon = $derived(spec.icon);
</script>

<Icon class="{spec.class} {className} shrink-0" aria-hidden="true" />
