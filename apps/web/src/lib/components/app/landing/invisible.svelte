<script lang="ts">
	import { onMount } from 'svelte';
	import { APP_NAME } from '$lib/constants';
	import { Button } from '$lib/components/ui/button';
	import Snippet from '../snippet.svelte';
	import Header from './header.svelte';

	let { signedIn = false }: { signedIn?: boolean } = $props();

	/**
	 * The same project two ways: skills copied in by hand, and the same skills
	 * linked by skilless. The page opens on the copies and flips once, so the
	 * first thing a visitor sees change is the thing the product changes.
	 */
	type Mode = 'copied' | 'linked';
	let mode = $state<Mode>('copied');
	let touched = false;

	const choose = (next: Mode) => {
		touched = true;
		mode = next;
	};

	onMount(() => {
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
			mode = 'linked';
			return;
		}
		const timer = setTimeout(() => {
			if (!touched) mode = 'linked';
		}, 1800);
		return () => clearTimeout(timer);
	});

	const skills = ['code-review', 'svelte-testing'];

	const modes: { id: Mode; label: string }[] = [
		{ id: 'copied', label: 'Copied in' },
		{ id: 'linked', label: `Linked by ${APP_NAME}` }
	];
</script>

<div class="flex min-h-dvh flex-col bg-background">
	<Header {signedIn} />

	<section class="flex flex-col items-center gap-8 px-6 pt-16 pb-14 text-center md:pt-28">
		<h1
			class="max-w-3xl text-5xl leading-[1.05] font-semibold tracking-tight text-balance md:text-6xl"
		>
			Skills in your project. Nothing in your diff.
		</h1>
		<p class="max-w-xl text-lg leading-relaxed text-muted-foreground">
			{APP_NAME} links skills into the projects that need them and tells git to look away. No skills folder
			to commit, no copies drifting apart across repos.
		</p>
		<Snippet command="npx {APP_NAME} init" />
	</section>

	<section class="mx-auto flex w-full max-w-5xl flex-col items-center gap-5 px-6 pb-24">
		<div
			role="radiogroup"
			aria-label="How the skills got into this project"
			class="inline-flex border border-border bg-card p-1"
		>
			{#each modes as m (m.id)}
				<button
					type="button"
					role="radio"
					aria-checked={mode === m.id}
					onclick={() => choose(m.id)}
					class="rounded-sm px-4 py-1.5 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50
						{mode === m.id ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}"
				>
					{m.label}
				</button>
			{/each}
		</div>

		<div
			class="grid w-full grid-cols-[minmax(0,1fr)] border border-border bg-card font-mono text-xs leading-6 md:grid-cols-2 md:text-sm"
		>
			<!-- the working tree -->
			<div class="flex flex-col border-b border-border md:border-r md:border-b-0">
				<div class="border-b border-border px-5 py-3 font-sans text-sm text-muted-foreground">
					storefront
				</div>
				<div
					class="grid grid-cols-[max-content_max-content] gap-x-8 overflow-x-auto px-5 py-5 whitespace-nowrap"
				>
					{#if mode === 'copied'}
						<span class="col-span-2">.claude/skills/</span>
						{#each skills as skill (skill)}
							<span class="pl-4 text-destructive">{skill}/SKILL.md</span>
							<span class="text-destructive">U</span>
						{/each}
					{:else}
						<span class="col-span-2">.agents/skills/</span>
						{#each skills as skill (skill)}
							<span class="pl-4">{skill}</span>
							<span class="text-muted-foreground">→ ~/.skilless/skills/{skill}</span>
						{/each}
						<span class="col-span-2">.claude/skills/</span>
						{#each skills as skill (skill)}
							<span class="pl-4">{skill}</span>
							<span class="text-muted-foreground">→ .agents/skills/{skill}</span>
						{/each}
					{/if}
					<span class="col-span-2 text-muted-foreground">src/</span>
					<span class="col-span-2 text-muted-foreground">package.json</span>
					<span class="col-span-2 text-muted-foreground">README.md</span>
				</div>
			</div>

			<!-- what git makes of it -->
			<div class="flex flex-col">
				<div class="border-b border-border px-5 py-3 font-sans text-sm text-muted-foreground">
					Terminal
				</div>
				<div class="flex min-h-56 flex-col overflow-x-auto px-5 py-5 whitespace-nowrap">
					<span class="text-foreground">$ git status</span>
					<span class="text-muted-foreground">On branch main</span>
					{#if mode === 'copied'}
						<span class="text-muted-foreground">Untracked files:</span>
						<span class="pl-4 text-muted-foreground/70">
							(use "git add &lt;file&gt;..." to include in what will be committed)
						</span>
						{#each skills as skill (skill)}
							<span class="pl-8 text-destructive">.claude/skills/{skill}/</span>
						{/each}
					{:else}
						<span class="text-chart-2">nothing to commit, working tree clean</span>
					{/if}
				</div>
			</div>
		</div>

		<p class="max-w-xl text-center text-sm text-muted-foreground" aria-live="polite">
			{#if mode === 'copied'}
				Two copies to commit here, and another to keep in step in every repo that uses them.
			{:else}
				Same skills, same agent. Your teammates clone exactly what they cloned before.
			{/if}
		</p>
	</section>

	<section class="border-t border-border">
		<div
			class="mx-auto grid w-full max-w-5xl grid-cols-[minmax(0,1fr)] gap-10 px-6 py-24 md:grid-cols-2 md:gap-16 md:py-32"
		>
			<div class="flex flex-col gap-4">
				<h2 class="text-3xl font-semibold tracking-tight text-balance">
					Hidden where git already looks, never where your team does
				</h2>
				<p class="leading-relaxed text-muted-foreground">
					Each skill {APP_NAME} links is listed in <code>.git/info/exclude</code>. That file lives
					inside <code>.git</code>, so it's never committed, and your <code>.gitignore</code> stays exactly
					as you wrote it.
				</p>
				<p class="leading-relaxed text-muted-foreground">
					Want a skill in the repo after all? <code>skilless vendor code-review</code> copies it in as
					real files and drops the rule.
				</p>
			</div>

			<div class="self-start border border-border bg-card font-mono text-xs leading-6 md:text-sm">
				<div class="border-b border-border px-5 py-3 font-sans text-sm text-muted-foreground">
					.git/info/exclude
				</div>
				<div class="flex flex-col overflow-x-auto px-5 py-5 whitespace-nowrap">
					{#each skills as skill (skill)}
						<span class="text-foreground">/.agents/skills/{skill}</span>
						<span class="text-foreground">/.claude/skills/{skill}</span>
					{/each}
				</div>
			</div>
		</div>
	</section>

	<section class="flex flex-col items-center gap-7 border-t border-border px-6 py-24 text-center">
		<h2 class="text-4xl font-semibold tracking-tight">Go Skilless</h2>
		<Button href="/login" size="lg">Get started</Button>
	</section>
</div>
