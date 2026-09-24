import { error } from '@sveltejs/kit';
import GithubSlugger from 'github-slugger';
import type { Component } from 'svelte';

/**
 * The docs are markdown files under `src/content/docs`, compiled to components
 * by mdsx (see mdsx.config.js). A page's slug is its path there, with
 * `index.md` as the docs home.
 */

export type DocMetadata = { title: string; description: string };
export type Heading = { id: string; text: string; depth: 2 | 3 };

type DocModule = { default: Component; metadata: DocMetadata };

const modules = import.meta.glob<DocModule>('/src/content/docs/**/*.md');
const sources = import.meta.glob<string>('/src/content/docs/**/*.md', {
	query: '?raw',
	import: 'default'
});

/** The sidebar, in reading order. Every page listed here must exist. */
export const nav: { title: string; pages: { slug: string; title: string }[] }[] = [
	{
		title: 'Getting started',
		pages: [
			{ slug: '', title: 'Introduction' },
			{ slug: 'quick-start', title: 'Quick start' },
			{ slug: 'how-it-works', title: 'How it works' }
		]
	},
	{
		title: 'Guides',
		pages: [
			{ slug: 'adding-skills', title: 'Adding skills' },
			{ slug: 'global-skills', title: 'Global skills' },
			{ slug: 'migrating', title: 'Moving existing skills in' },
			{ slug: 'vendoring', title: 'Committing a skill' }
		]
	},
	{
		title: 'Cloud',
		pages: [
			{ slug: 'cloud/sync', title: 'Sync' },
			{ slug: 'cloud/cloud-agents', title: 'Cloud agents' }
		]
	},
	{
		title: 'Reference',
		pages: [{ slug: 'cli', title: 'CLI' }]
	}
];

const order = nav.flatMap((section) => section.pages);

export const href = (slug: string) => (slug ? `/docs/${slug}` : '/docs');

/** Where a page's markdown is served: `/docs.md`, `/docs/cli.md` and so on. */
export const markdownHref = (slug: string) => `${href(slug)}.md`;

function file(slug: string) {
	return `/src/content/docs/${slug || 'index'}.md`;
}

/**
 * Headings for "On this page", read from the markdown rather than the rendered
 * page so they are there on the server. Ids come from the same slugger
 * rehype-slug uses, fed every heading in order, so duplicates number the same.
 */
function headings(source: string): Heading[] {
	const slugger = new GithubSlugger();
	const found: Heading[] = [];
	let fenced = false;

	for (const line of source.split('\n')) {
		if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
		if (fenced) continue;

		const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
		if (!match) continue;

		// text as rendered: no inline code ticks, emphasis or link syntax
		const text = match[2]
			.replace(/`([^`]*)`/g, '$1')
			.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
			.replace(/[*_]/g, '');
		const id = slugger.slug(text);
		const depth = match[1].length;

		if (depth === 2 || depth === 3) found.push({ id, text, depth });
	}

	return found;
}

export async function getDoc(slug: string) {
	const path = file(slug);
	const load = modules[path];
	const source = sources[path];
	if (!load || !source) error(404, 'No docs page here.');

	const [mod, raw] = await Promise.all([load(), source()]);
	const index = order.findIndex((page) => page.slug === slug);

	return {
		slug,
		component: mod.default,
		metadata: mod.metadata,
		headings: headings(raw),
		// sent with the page so "Copy page" can write it without a fetch in between
		markdown: toMarkdown(raw, mod.metadata),
		previous: index > 0 ? order[index - 1] : undefined,
		next: index >= 0 ? order[index + 1] : undefined
	};
}

/**
 * A page as markdown, for agents and anyone who'd rather read the source. The
 * frontmatter becomes a title and summary, so the file reads on its own.
 */
function toMarkdown(raw: string, metadata: DocMetadata): string {
	const body = raw.replace(/^---\n[\s\S]*?\n---\n/, '').trim();
	return `# ${metadata.title}\n\n${metadata.description}\n\n${body}\n`;
}

export async function getMarkdown(slug: string): Promise<string | undefined> {
	const load = modules[file(slug)];
	const source = sources[file(slug)];
	if (!load || !source) return undefined;

	const [mod, raw] = await Promise.all([load(), source()]);
	return toMarkdown(raw, mod.metadata);
}

export function markdownResponse(markdown: string | undefined): Response {
	if (markdown === undefined) {
		return new Response('No docs page here.\n', {
			status: 404,
			headers: { 'content-type': 'text/plain; charset=utf-8' }
		});
	}

	return new Response(markdown, {
		headers: { 'content-type': 'text/markdown; charset=utf-8' }
	});
}
