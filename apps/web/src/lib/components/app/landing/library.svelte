<script lang="ts">
	import { APP_NAME } from '$lib/constants';
	import { Button } from '$lib/components/ui/button';
	import Snippet from '../snippet.svelte';
	import Header from './header.svelte';

	let { signedIn = false }: { signedIn?: boolean } = $props();

	/**
	 * The mechanism, drawn: one library on the left, the projects that use it on
	 * the right, and a line for every link skilless makes. Pick either side to
	 * trace it. Rows have fixed heights so the lines can be plotted from indices
	 * alone, with nothing measured.
	 */
	const SKILL_ROW = 40;
	const PROJECT_ROW = 80;

	const skills = [
		'code-review',
		'svelte-testing',
		'update-deps',
		'resolve-comments',
		'triage',
		'animate'
	];

	const projects = [
		{
			owner: 'ieedan',
			name: 'skilless',
			skills: ['code-review', 'resolve-comments', 'update-deps']
		},
		{ owner: 'acme', name: 'storefront', skills: ['code-review', 'svelte-testing', 'animate'] },
		{ owner: 'acme', name: 'api', skills: ['update-deps', 'triage'] }
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

	type Selection = { kind: 'skill' | 'project'; name: string };
	let selected = $state<Selection>({ kind: 'project', name: 'skilless' });

	const isLit = (link: { skill: string; project: string }) =>
		selected.kind === 'skill' ? link.skill === selected.name : link.project === selected.name;

	const skillLit = (skill: string) =>
		selected.kind === 'skill'
			? skill === selected.name
			: projects.find((p) => p.name === selected.name)!.skills.includes(skill);

	const projectLit = (name: string) =>
		selected.kind === 'project'
			? name === selected.name
			: projects.find((p) => p.name === name)!.skills.includes(selected.name);

	const selectedProject = $derived(
		selected.kind === 'project' ? projects.find((p) => p.name === selected.name) : undefined
	);
	const usedBy = $derived(
		selected.kind === 'skill' ? projects.filter((p) => p.skills.includes(selected.name)) : []
	);
</script>

<div class="flex min-h-dvh flex-col bg-background">
	<Header {signedIn} />

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

			<div class="flex flex-wrap items-center gap-3">
				<Snippet command="npx {APP_NAME} init" />
				<Button href="/login" size="lg" variant="outline" class="h-12">Get started</Button>
			</div>
		</section>

		<figure class="border border-border bg-card">
			<div
				class="grid grid-cols-[minmax(0,1fr)_minmax(40px,22%)_minmax(0,1fr)] border-b border-border px-4 py-3 text-sm md:px-6"
			>
				<span class="font-mono text-muted-foreground">~/.skilless/skills</span>
				<span></span>
				<span class="pl-4 text-muted-foreground">Your projects</span>
			</div>

			<div class="grid grid-cols-[minmax(0,1fr)_minmax(40px,22%)_minmax(0,1fr)] px-4 py-5 md:px-6">
				<ul class="flex flex-col" aria-label="Skills in your library">
					{#each skills as skill (skill)}
						<li style="height: {SKILL_ROW}px">
							<button
								type="button"
								aria-pressed={selected.kind === 'skill' && selected.name === skill}
								onclick={() => (selected = { kind: 'skill', name: skill })}
								class="flex h-full w-full items-center justify-between gap-2 pr-0 text-left font-mono text-xs transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm
									{skillLit(skill) ? 'text-foreground' : 'text-muted-foreground/70 hover:text-foreground'}"
							>
								<span class="truncate">{skill}</span>
								<span
									class="size-2 shrink-0 border border-foreground transition-colors {skillLit(skill)
										? 'bg-foreground'
										: 'border-muted-foreground/50 bg-card'}"
								></span>
							</button>
						</li>
					{/each}
				</ul>

				<svg
					viewBox="0 0 100 {height}"
					preserveAspectRatio="none"
					class="w-full"
					style="height: {height}px"
					aria-hidden="true"
				>
					{#each links as link (link.skill + link.project)}
						<path
							d="M0 {link.from} C 55 {link.from}, 45 {link.to}, 100 {link.to}"
							fill="none"
							vector-effect="non-scaling-stroke"
							class="transition-[stroke,stroke-width] duration-300 {isLit(link)
								? 'stroke-foreground'
								: 'stroke-border'}"
							stroke-width={isLit(link) ? 1.5 : 1}
						/>
					{/each}
				</svg>

				<ul class="flex flex-col" aria-label="Projects">
					{#each projects as project (project.name)}
						<li style="height: {PROJECT_ROW}px">
							<button
								type="button"
								aria-pressed={selected.kind === 'project' && selected.name === project.name}
								onclick={() => (selected = { kind: 'project', name: project.name })}
								class="flex h-full w-full items-center gap-3 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50
									{projectLit(project.name) ? 'text-foreground' : 'text-muted-foreground/70 hover:text-foreground'}"
							>
								<span
									class="size-2 shrink-0 border transition-colors {projectLit(project.name)
										? 'border-foreground bg-foreground'
										: 'border-muted-foreground/50 bg-card'}"
								></span>
								<span class="flex min-w-0 flex-col">
									<span class="truncate text-sm font-medium md:text-base"
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

			<figcaption
				class="min-h-44 border-t border-border bg-background/60 px-4 py-5 font-mono text-xs leading-6 md:px-6 md:text-sm"
			>
				{#if selectedProject}
					<div
						class="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-6 overflow-x-auto whitespace-nowrap"
					>
						<span class="col-span-2 text-foreground">{selectedProject.name}/</span>
						<span class="col-span-2 pl-4 text-muted-foreground">.agents/skills/</span>
						{#each selectedProject.skills as skill (skill)}
							<span class="pl-8 text-foreground">{skill}</span>
							<span class="text-muted-foreground">→ ~/.skilless/skills/{skill}</span>
						{/each}
						<span class="pl-4 text-muted-foreground">.claude/skills/</span>
						<span class="text-muted-foreground">→ each one links back to .agents/skills</span>
						<span class="pl-4 text-muted-foreground">.git/info/exclude</span>
						<span class="text-chart-2">keeps all of it out of git</span>
					</div>
				{:else}
					<div class="flex flex-col gap-2 font-sans text-sm md:text-base">
						<p>
							<code class="text-foreground">~/.skilless/skills/{selected.name}</code> is the only copy.
						</p>
						<p class="text-muted-foreground">
							{#if usedBy.length}
								It's linked into {usedBy.map((p) => p.name).join(' and ')}. Edit it once and
								{usedBy.length > 1 ? 'both see' : 'it sees'} the change on the next run.
							{:else}
								It isn't in any project yet. Run <code>skilless add {selected.name}</code> to link it.
							{/if}
						</p>
					</div>
				{/if}
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
