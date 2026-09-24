<script lang="ts">
	import { APP_NAME } from '$lib/constants';
	import { Button } from '$lib/components/ui/button';
	import Logo from './logo.svelte';
	import Snippet from './snippet.svelte';

	let { signedIn = false }: { signedIn?: boolean } = $props();

	/**
	 * The mechanism, drawn: one library on the left, the projects that use it on
	 * the right, and a line for every link skilless makes. Pick either side to
	 * trace it. Rows have fixed heights so the lines can be plotted from indices
	 * alone; only the width of the gap between the columns is measured.
	 */
	const SKILL_ROW = 40;
	const PROJECT_ROW = 80;

	// popular skills from skills.sh, in open source projects from around this one
	const skills = [
		'frontend-design',
		'web-design-guidelines',
		'agent-browser',
		'diagnosing-bugs',
		'grill-me',
		'find-skills'
	];

	const projects = [
		{
			owner: 'huntabyte',
			name: 'shadcn-svelte',
			skills: ['frontend-design', 'web-design-guidelines', 'agent-browser']
		},
		{
			owner: 'jsrepojs',
			name: 'jsrepo',
			skills: ['diagnosing-bugs', 'grill-me', 'find-skills']
		},
		{
			owner: 'ieedan',
			name: 'shadcn-svelte-extras',
			skills: ['frontend-design', 'agent-browser', 'diagnosing-bugs']
		}
	];

	const height = skills.length * SKILL_ROW;

	const links = projects.flatMap((project, p) =>
		project.skills.map((skill) => ({
			skill,
			project: project.name,
			from: skills.indexOf(skill) * SKILL_ROW + SKILL_ROW / 2,
			to: p * PROJECT_ROW + PROJECT_ROW / 2
		}))
	);

	type Link = (typeof links)[number];
	type Selection = { kind: 'skill' | 'project'; name: string };

	let selected = $state<Selection>({ kind: 'project', name: 'shadcn-svelte' });

	// drawn at the real width, so strokes keep their weight and dashes their length
	let width = $state(100);

	const isLit = (link: Link) =>
		selected.kind === 'skill' ? link.skill === selected.name : link.project === selected.name;

	const lit = $derived(links.filter(isLit));

	/**
	 * A link's curve, always traced from the skill to the project: the draw-in
	 * animation follows it, so skills visibly flow into the projects using them.
	 */
	const curve = (link: Link) => {
		const mid = width / 2;
		return `M0 ${link.from} C${mid} ${link.from}, ${mid} ${link.to}, ${width} ${link.to}`;
	};

	const skillLit = (skill: string) =>
		selected.kind === 'skill'
			? skill === selected.name
			: projects.find((p) => p.name === selected.name)!.skills.includes(skill);

	const projectLit = (name: string) =>
		selected.kind === 'project'
			? name === selected.name
			: projects.find((p) => p.name === name)!.skills.includes(selected.name);

	const isSelected = (kind: Selection['kind'], name: string) =>
		selected.kind === kind && selected.name === name;

	const usedBy = (skill: string) => projects.filter((p) => p.skills.includes(skill));
</script>

<div class="flex min-h-dvh flex-col bg-background">
	<header class="flex items-center justify-between px-6 py-7 md:px-30">
		<a href="/" class="flex py-1">
			<Logo class="h-4" />
		</a>

		<nav class="flex items-center gap-3">
			{#if signedIn}
				<Button href="/skills">Dashboard</Button>
			{:else}
				<Button href="/login">Sign Up</Button>
				<Button href="/login" variant="outline">Login</Button>
			{/if}
		</nav>
	</header>

	<main class="mx-auto flex w-full max-w-5xl flex-col px-6">
		<section class="flex max-w-2xl flex-col gap-8 pt-16 pb-14 md:pt-28">
			<div class="flex flex-col gap-5">
				<h1 class="text-5xl leading-[1.05] font-semibold tracking-tight text-balance md:text-6xl">
					One copy of every skill. Linked only where you need it.
				</h1>
				<p class="max-w-xl text-lg leading-relaxed text-muted-foreground">
					{APP_NAME} keeps your skills in a single library and links each one into the projects that use
					it. Edit a skill once and every project sees the change.
				</p>
			</div>

			<!-- one height for both, so they line up side by side or wrapped -->
			<div class="flex flex-wrap items-center gap-3">
				<Snippet command="npx {APP_NAME} init" class="h-12 py-0" />
				<Button href="/login" size="lg" variant="outline" class="h-12">Get started</Button>
			</div>
		</section>

		<figure class="border border-border bg-card">
			<div
				class="grid grid-cols-[minmax(0,1.3fr)_36px_minmax(0,1fr)] border-b border-border px-3 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(40px,22%)_minmax(0,1fr)] sm:px-4 md:px-6"
			>
				<span class="font-mono text-muted-foreground">~/.skilless/skills</span>
				<span></span>
				<span class="pl-4 text-muted-foreground">Your projects</span>
			</div>

			<div
				class="grid grid-cols-[minmax(0,1.3fr)_36px_minmax(0,1fr)] px-3 py-5 sm:grid-cols-[minmax(0,1fr)_minmax(40px,22%)_minmax(0,1fr)] sm:px-4 md:px-6"
			>
				<ul class="flex flex-col" aria-label="Skills in your library">
					{#each skills as skill (skill)}
						{@const on = skillLit(skill)}
						<li style="height: {SKILL_ROW}px">
							<button
								type="button"
								aria-pressed={isSelected('skill', skill)}
								onclick={() => (selected = { kind: 'skill', name: skill })}
								class="flex h-full w-full items-center justify-between gap-2 text-left font-mono text-[11px] transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-xs md:text-sm
									{on ? 'text-foreground' : 'text-muted-foreground/70 hover:text-foreground'}"
							>
								<span class="truncate">{skill}</span>
								<span
									class="size-2 shrink-0 border transition-colors
										{on ? 'border-foreground bg-foreground' : 'border-muted-foreground/50 bg-card'}"
								></span>
							</button>
						</li>
					{/each}
				</ul>

				<div bind:clientWidth={width} style="height: {height}px">
					<svg {width} {height} viewBox="0 0 {width} {height}" class="block" aria-hidden="true">
						{#each links as link (link.skill + link.project)}
							<path d={curve(link)} fill="none" class="stroke-border" stroke-width="1" />
						{/each}

						<!--
							Lit links are a layer of their own, drawn after the rest so they always
							sit on top. Keyed on the selection so each pick draws them in afresh.
						-->
						{#key selected}
							{#each lit as link, i (link.skill + link.project)}
								<path
									d={curve(link)}
									fill="none"
									pathLength="1"
									class="link-draw stroke-foreground"
									stroke-width="1.5"
									style="animation-delay: {i * 70}ms"
								/>
							{/each}
						{/key}
					</svg>
				</div>

				<ul class="flex flex-col" aria-label="Projects">
					{#each projects as project (project.name)}
						{@const on = projectLit(project.name)}
						<li style="height: {PROJECT_ROW}px">
							<button
								type="button"
								aria-pressed={isSelected('project', project.name)}
								onclick={() => (selected = { kind: 'project', name: project.name })}
								class="flex h-full w-full items-center gap-3 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50
									{on ? 'text-foreground' : 'text-muted-foreground/70 hover:text-foreground'}"
							>
								<!-- fills once the lines flowing into it arrive -->
								<span
									class="size-2 shrink-0 border transition-colors
										{on ? 'border-foreground bg-foreground delay-300' : 'border-muted-foreground/50 bg-card'}"
								></span>
								<span class="flex min-w-0 flex-col">
									<span class="text-sm font-medium break-words sm:truncate md:text-base"
										><span class="hidden text-muted-foreground sm:inline">{project.owner}/</span
										>{project.name}</span
									>
									<span class="truncate text-xs text-muted-foreground">
										{project.skills.length} skills linked
									</span>
								</span>
							</button>
						</li>
					{/each}
				</ul>
			</div>

			<!--
				Every possible caption is rendered into the same grid cell and all but the
				current one hidden, so the box is always as tall as the tallest of them and
				nothing below it moves when the selection changes.
			-->
			<figcaption
				class="grid grid-cols-[minmax(0,1fr)] border-t border-border bg-background/60 px-4 py-5 font-mono text-xs leading-6 md:px-6 md:text-sm"
			>
				{#each projects as project (project.name)}
					{@const shown = isSelected('project', project.name)}
					<div
						aria-hidden={!shown}
						class="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-6 self-start overflow-x-auto whitespace-nowrap [grid-area:1/1]
							{shown ? '' : 'invisible'}"
					>
						<span class="col-span-2 text-foreground">{project.name}/</span>
						<span class="col-span-2 pl-4 text-muted-foreground">.agents/skills/</span>
						{#each project.skills as skill (skill)}
							<span class="pl-8 text-foreground">{skill}</span>
							<span class="text-muted-foreground">→ ~/.skilless/skills/{skill}</span>
						{/each}
						<span class="pl-4 text-muted-foreground">.claude/skills/</span>
						<span class="text-muted-foreground">→ each one links back to .agents/skills</span>
						<span class="pl-4 text-muted-foreground">.git/info/exclude</span>
						<span class="text-chart-2">keeps all of it out of git</span>
					</div>
				{/each}

				{#each skills as skill (skill)}
					{@const shown = isSelected('skill', skill)}
					{@const users = usedBy(skill)}
					<div
						aria-hidden={!shown}
						class="flex flex-col gap-2 self-start font-sans text-sm [grid-area:1/1] md:text-base
							{shown ? '' : 'invisible'}"
					>
						<p>
							<code class="text-foreground">~/.skilless/skills/{skill}</code> is the only copy.
						</p>
						<p class="text-muted-foreground">
							{#if users.length}
								It's linked into {users.map((p) => `${p.owner}/${p.name}`).join(' and ')}. Edit it
								once and
								{users.length > 1 ? 'both see' : 'it sees'} the change on the next run.
							{:else}
								It isn't in any project yet. Run <code>skilless add {skill}</code> to link it.
							{/if}
						</p>
					</div>
				{/each}
			</figcaption>
		</figure>
		<p class="mt-3 text-sm text-muted-foreground">Pick a skill or a project to trace its links.</p>

		<section class="grid gap-10 py-24 md:grid-cols-2 md:gap-16 md:py-32">
			<div class="flex flex-col gap-3">
				<h2 class="text-2xl font-semibold tracking-tight">Every machine, one library</h2>
				<p class="leading-relaxed text-muted-foreground">
					Sign in with <code>skilless auth</code> and <code>skilless sync</code> keeps your library the
					same on every computer, in both directions, deletions included.
				</p>
			</div>
			<div class="flex flex-col gap-3">
				<h2 class="text-2xl font-semibold tracking-tight">Cloud agents too</h2>
				<p class="leading-relaxed text-muted-foreground">
					Add <code>SKILLESS_TOKEN=… npx skilless install</code> to an agent's setup step and it gets
					the same skills your project has locally.
				</p>
			</div>
		</section>
	</main>

	<section class="flex flex-col items-center gap-7 border-t border-border px-6 py-24 text-center">
		<h2 class="text-4xl font-semibold tracking-tight">Go Skilless</h2>
		<Button href="/login" size="lg">Get started</Button>
	</section>
</div>

<style>
	.link-draw {
		stroke-dasharray: 1;
		stroke-dashoffset: 1;
		animation: draw 450ms cubic-bezier(0.3, 0, 0.2, 1) forwards;
	}

	@keyframes draw {
		to {
			stroke-dashoffset: 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.link-draw {
			animation: none;
			stroke-dashoffset: 0;
		}
	}
</style>
