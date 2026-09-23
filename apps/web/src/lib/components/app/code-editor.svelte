<script lang="ts" module>
	import { HighlightStyle, syntaxHighlighting, StreamLanguage } from '@codemirror/language';
	import { tags as t } from '@lezer/highlight';
	import { EditorView } from '@codemirror/view';

	/**
	 * Colours come from the design tokens rather than a packaged CodeMirror theme,
	 * so the editor follows light/dark with everything else.
	 */
	const highlight = HighlightStyle.define([
		{ tag: [t.keyword, t.modifier, t.operatorKeyword], color: 'var(--cm-keyword)' },
		{ tag: [t.string, t.special(t.string)], color: 'var(--cm-string)' },
		{ tag: [t.number, t.bool, t.null, t.atom], color: 'var(--cm-number)' },
		{ tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--cm-comment)' },
		{ tag: [t.propertyName, t.attributeName], color: 'var(--cm-property)' },
		{ tag: [t.function(t.variableName), t.function(t.propertyName)], color: 'var(--cm-function)' },
		{ tag: [t.typeName, t.className, t.namespace], color: 'var(--cm-type)' },
		{ tag: [t.heading, t.strong], color: 'var(--cm-keyword)', fontWeight: '600' },
		{ tag: t.emphasis, fontStyle: 'italic' },
		{ tag: [t.link, t.url], color: 'var(--cm-string)', textDecoration: 'underline' },
		{ tag: [t.meta, t.processingInstruction], color: 'var(--cm-comment)' },
		{ tag: t.invalid, color: 'var(--destructive)' }
	]);

	const theme = EditorView.theme({
		/*
		 * Size and metrics live on the root so the gutter inherits them. Set only
		 * on `.cm-content`, the line numbers fall back to the page's 16px and sit
		 * a line off from the code they label.
		 */
		'&': {
			color: 'var(--card-foreground)',
			backgroundColor: 'transparent',
			height: '100%',
			fontFamily: 'var(--font-mono)',
			fontSize: '13px',
			lineHeight: '1.6'
		},
		'.cm-content': { caretColor: 'var(--foreground)', padding: '0' },
		'.cm-scroller': {
			fontFamily: 'inherit',
			fontSize: 'inherit',
			lineHeight: 'inherit',
			overflowX: 'auto'
		},
		'&.cm-focused': { outline: 'none' },
		'.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--foreground)' },
		'&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
			backgroundColor: 'var(--secondary)'
		},
		// opaque, matching the panel, so code scrolled sideways passes under the numbers
		'.cm-gutters': {
			backgroundColor: 'var(--card)',
			color: 'var(--muted-foreground)',
			border: 'none',
			paddingRight: '16px',
			fontFamily: 'inherit',
			fontSize: 'inherit',
			lineHeight: 'inherit'
		},
		'.cm-lineNumbers .cm-gutterElement': { lineHeight: 'inherit' },
		'.cm-activeLine': { backgroundColor: 'transparent' },
		'.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--foreground)' }
	});

	async function languageFor(path: string) {
		const ext = path.split('.').pop()?.toLowerCase() ?? '';

		if (['ts', 'tsx', 'mts', 'cts'].includes(ext)) {
			const { javascript } = await import('@codemirror/lang-javascript');
			return javascript({ typescript: true, jsx: ext === 'tsx' });
		}
		if (['js', 'jsx', 'mjs', 'cjs'].includes(ext)) {
			const { javascript } = await import('@codemirror/lang-javascript');
			return javascript({ jsx: ext === 'jsx' });
		}
		if (ext === 'json') {
			const { json } = await import('@codemirror/lang-json');
			return json();
		}
		if (['yml', 'yaml'].includes(ext)) {
			const { yaml } = await import('@codemirror/lang-yaml');
			return yaml();
		}
		if (['md', 'mdx'].includes(ext)) {
			const { markdown } = await import('@codemirror/lang-markdown');
			return markdown();
		}

		// unknown extension: no grammar rather than a wrong one
		return StreamLanguage.define({ token: (stream) => (stream.next(), null) });
	}
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import { EditorState } from '@codemirror/state';
	import { keymap, lineNumbers, highlightActiveLineGutter } from '@codemirror/view';
	import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';

	let {
		value = $bindable(),
		path,
		readonly = false,
		onSave
	}: {
		value: string;
		path: string;
		readonly?: boolean;
		onSave?: () => void;
	} = $props();

	let host = $state<HTMLDivElement | null>(null);
	let view: EditorView | undefined;

	onMount(() => {
		let disposed = false;

		(async () => {
			const language = await languageFor(path);
			if (disposed || !host) return;

			view = new EditorView({
				parent: host,
				state: EditorState.create({
					doc: value,
					extensions: [
						lineNumbers(),
						highlightActiveLineGutter(),
						history(),
						syntaxHighlighting(highlight),
						language,
						theme,
						EditorState.readOnly.of(readonly),
						keymap.of([
							{
								key: 'Mod-s',
								preventDefault: true,
								run: () => {
									onSave?.();
									return true;
								}
							},
							indentWithTab,
							...defaultKeymap,
							...historyKeymap
						]),
						EditorView.updateListener.of((update) => {
							if (update.docChanged) value = update.state.doc.toString();
						})
					]
				})
			});
		})();

		return () => {
			disposed = true;
			view?.destroy();
			view = undefined;
		};
	});

	/**
	 * Push an external change (a save round trip, or navigating to another file)
	 * back into the editor, but never echo the user's own typing.
	 */
	$effect(() => {
		const next = value;
		if (view && view.state.doc.toString() !== next) {
			view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } });
		}
	});
</script>

<div bind:this={host} class="h-full w-full"></div>
