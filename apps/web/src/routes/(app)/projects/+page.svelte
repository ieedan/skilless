<script lang="ts">
	import { APP_NAME } from '$lib/constants';
	import { projectParts } from '$lib/project';
	import { Resolved } from '$lib/resolved.svelte';
	import { around, highlight, search, terms } from '$lib/search';
	import ProjectIcon from '$lib/components/app/project-icon.svelte';
	import ReadingColumn from '$lib/components/app/reading-column.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import RiSearchLine from 'remixicon-svelte/icons/search-line';

	let { data } = $props();

	// live subscriptions seeded with the server's data (see hooks.ts)
	const skills = $derived(data.skills.data ?? []);
	const projects = $derived(data.projects.data ?? []);

	const descriptions = $derived(new Resolved(data.descriptions, {}));

	/** Skills bound to each project. Globals reach every project, so they would only add noise. */
	const counts = $derived.by(() => {
		const counts: Record<string, number> = {};
		for (const skill of skills) {
			if (skill.global) continue;
			for (const id of skill.projectIds) counts[id] = (counts[id] ?? 0) + 1;
		}
		return counts;
	});

	const rows = $derived(
		projects.map((project) => {
			const parts = projectParts(project.key);
			return {
				project,
				parts,
				// `search` matches on these two
				name: parts.path,
				description: descriptions.current[project.key] ?? undefined,
				count: counts[project._id] ?? 0
			};
		})
	);

	let query = $state('');
	const queryTerms = $derived(terms(query));
	const results = $derived(search(rows, query));
</script>

{#snippet marked(text: string)}
	<!-- one line: whitespace between segments would render as stray spaces -->
	{#each highlight(text, queryTerms) as segment, i (i)}{#if segment.match}<mark
				class="bg-primary/20 text-foreground">{segment.text}</mark
			>{:else}{segment.text}{/if}{/each}
{/snippet}

<svelte:head><title>Projects · {APP_NAME}</title></svelte:head>

<ReadingColumn>
	{#if projects.length === 0}
		<div class="flex flex-col items-center justify-center gap-2 px-8 py-24 text-center">
			<p class="text-sm text-card-foreground">No projects yet</p>
			<p class="text-sm text-muted-foreground">
				Run <code class="font-mono text-foreground">skilless add &lt;skill&gt;</code> inside a repo to
				add it here.
			</p>
		</div>
	{:else}
		<div class="relative mt-4 mb-2">
			<RiSearchLine
				class="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
				aria-hidden="true"
			/>
			<Input
				type="search"
				placeholder="Search projects"
				aria-label="Search projects"
				autocomplete="off"
				spellcheck="false"
				class="pl-8"
				bind:value={query}
			/>
		</div>

		{#if results.length === 0}
			<p class="px-6 py-16 text-center text-sm text-muted-foreground">
				No projects match “{query.trim()}”.
			</p>
		{/if}

		<ul class="divide-y divide-border">
			{#each results as { project, parts, description, count } (project._id)}
				<li>
					<a href="/projects/{project.key}" class="flex items-start gap-3 py-3.5">
						<ProjectIcon {parts} size="md" class="mt-0.5" />

						<div class="flex min-w-0 flex-1 flex-col gap-1.5">
							<span class="flex min-w-0 items-center gap-2">
								<span
									class="truncate text-sm font-semibold text-card-foreground"
									title={project.key}
								>
									{@render marked(parts.path)}
								</span>
								<span class="shrink-0 text-xs text-muted-foreground">
									{count}
									{count === 1 ? 'skill' : 'skills'}
								</span>
							</span>

							<!-- clamped to two lines, like skill descriptions -->
							{#if description}
								<span class="line-clamp-2 text-[13px] text-muted-foreground">
									{@render marked(around(description, queryTerms))}
								</span>
							{:else if !descriptions.settled && parts.host === 'github'}
								<Skeleton class="my-0.5 h-3.5 w-2/3" />
							{:else}
								<span class="text-[13px] text-muted-foreground">No description</span>
							{/if}
						</div>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</ReadingColumn>
