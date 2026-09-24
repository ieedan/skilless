<script lang="ts">
	import { APP_NAME } from '$lib/constants';
	import { Button } from '$lib/components/ui/button';
	import Snippet from '../snippet.svelte';
	import Header from './header.svelte';

	let { signedIn = false }: { signedIn?: boolean } = $props();

	/**
	 * The product's own promise, taken literally: three verbs, three steps. The
	 * headline is the table of contents, and each step shows the commands and
	 * the output the CLI really prints (see packages/skilless/src/commands).
	 */
	type Line = { text: string; tone?: 'cmd' | 'ok' | 'dim' };

	const steps: {
		id: string;
		headline: string;
		title: string;
		body: string;
		output: Line[];
	}[] = [
		{
			id: 'author',
			headline: 'Author once.',
			title: 'Write it in one place',
			body: 'Every skill lives in your library at ~/.skilless/skills. Create a new one, or import the skills folders you already have scattered across repos.',
			output: [
				{ text: '$ skilless create code-review', tone: 'cmd' },
				{ text: '✔ Created code-review in your library.', tone: 'ok' },
				{ text: '✔ Added code-review to github.com/acme/storefront.', tone: 'ok' },
				{ text: '  Edit code-review at ~/.skilless/skills/code-review/SKILL.md', tone: 'dim' }
			]
		},
		{
			id: 'sync',
			headline: 'Sync everywhere.',
			title: 'Keep every machine current',
			body: 'Sign in once and sync runs both ways: edits, new skills and deletions go up from one computer and down to the next.',
			output: [
				{ text: '$ skilless sync', tone: 'cmd' },
				{ text: '✔ Pushed code-review to skilless.dev.', tone: 'ok' },
				{ text: '✔ Pulled update-deps from skilless.dev.', tone: 'ok' },
				{ text: '✔ Deleted old-lint everywhere.', tone: 'ok' },
				{ text: '✔ Linked update-deps into this project.', tone: 'ok' }
			]
		},
		{
			id: 'install',
			headline: 'Install per project.',
			title: 'Give each project only what it needs',
			body: "Add a skill and it's linked into this repo alone, hidden from git. Cloud agents get the same set with a token in their setup step.",
			output: [
				{ text: '$ skilless add svelte-testing', tone: 'cmd' },
				{ text: '✔ Added svelte-testing to this project.', tone: 'ok' },
				{ text: '' },
				{ text: '# in a cloud agent', tone: 'dim' },
				{ text: '$ SKILLESS_TOKEN=… npx skilless install', tone: 'cmd' },
				{ text: '✔ Installed code-review.', tone: 'ok' },
				{ text: '✔ Installed svelte-testing.', tone: 'ok' }
			]
		}
	];

	const tone = {
		cmd: 'text-foreground',
		ok: 'text-chart-2',
		dim: 'text-muted-foreground'
	};
</script>

<div class="flex min-h-dvh flex-col bg-background">
	<Header {signedIn} />

	<main class="mx-auto flex w-full max-w-6xl flex-col px-6">
		<section class="flex flex-col gap-10 pt-16 pb-20 md:pt-28 md:pb-32">
			<h1
				class="flex flex-col text-5xl leading-[1.02] font-semibold tracking-tight sm:text-7xl md:text-8xl"
			>
				{#each steps as step (step.id)}
					<a
						href="#{step.id}"
						class="w-fit decoration-2 underline-offset-[0.12em] outline-none hover:underline focus-visible:underline"
					>
						{step.headline}
					</a>
				{/each}
			</h1>

			<div class="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
				<p class="max-w-md text-lg leading-relaxed text-muted-foreground">
					{APP_NAME} is a command line tool for the skills your coding agents read. One library, synced
					across machines, linked into the projects you choose.
				</p>
				<Snippet command="npx {APP_NAME} init" />
			</div>
		</section>

		<ol class="flex flex-col border-t border-border">
			{#each steps as step, i (step.id)}
				<li
					id={step.id}
					class="grid scroll-mt-8 gap-6 border-b border-border py-12 md:grid-cols-[5rem_minmax(0,1fr)_minmax(0,1.3fr)] md:gap-10 md:py-16"
				>
					<span class="font-mono text-sm text-muted-foreground tabular-nums">
						{String(i + 1).padStart(2, '0')}
					</span>

					<div class="flex flex-col gap-3">
						<h2 class="text-2xl font-semibold tracking-tight">{step.title}</h2>
						<p class="max-w-md leading-relaxed text-muted-foreground">{step.body}</p>
					</div>

					<div
						class="flex flex-col overflow-x-auto border border-border bg-card px-5 py-4 font-mono text-xs leading-6 whitespace-nowrap md:text-[13px]"
					>
						{#each step.output as line, j (j)}
							<span class="min-h-6 {tone[line.tone ?? 'dim']}">{line.text}</span>
						{/each}
					</div>
				</li>
			{/each}
		</ol>
	</main>

	<section class="flex flex-col items-center gap-7 px-6 py-24 text-center md:py-32">
		<h2 class="text-4xl font-semibold tracking-tight">Go Skilless</h2>
		<Button href="/login" size="lg">Get started</Button>
	</section>
</div>
