<script lang="ts">
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import { APP_NAME } from '$lib/constants';
	import { href, markdownHref } from '$lib/docs';

	let { data } = $props();
</script>

<svelte:head>
	<title>{data.metadata.title} · {APP_NAME} docs</title>
	<meta name="description" content={data.metadata.description} />
	<meta property="og:title" content="{data.metadata.title} · {APP_NAME} docs" />
	<meta property="og:description" content={data.metadata.description} />
	<link rel="alternate" type="text/markdown" href={markdownHref(data.slug)} />
</svelte:head>

<div class="flex gap-12 py-10 md:py-14">
	<article class="min-w-0 flex-1 xl:max-w-3xl">
		<header class="mb-10 flex flex-col gap-3 border-b border-border pb-8">
			<h1 class="text-4xl font-semibold tracking-tight text-balance">{data.metadata.title}</h1>
			<p class="text-lg leading-relaxed text-pretty text-muted-foreground">
				{data.metadata.description}
			</p>
			<a
				href={markdownHref(data.slug)}
				data-sveltekit-reload
				class="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
			>
				<FileTextIcon class="size-3.5" />View as Markdown
			</a>
		</header>

		<data.component />

		{#if data.previous || data.next}
			<nav
				aria-label="Pages"
				class="mt-16 grid grid-cols-2 gap-4 border-t border-border pt-8 text-sm"
			>
				{#if data.previous}
					<a
						href={href(data.previous.slug)}
						class="flex flex-col gap-1 rounded-md border border-border p-4 transition-colors hover:bg-accent"
					>
						<span class="flex items-center gap-1 text-muted-foreground">
							<ChevronLeftIcon class="size-3.5" />Previous
						</span>
						<span class="font-medium">{data.previous.title}</span>
					</a>
				{:else}
					<span></span>
				{/if}
				{#if data.next}
					<a
						href={href(data.next.slug)}
						class="col-start-2 flex flex-col items-end gap-1 rounded-md border border-border p-4 text-right transition-colors hover:bg-accent"
					>
						<span class="flex items-center gap-1 text-muted-foreground">
							Next<ChevronRightIcon class="size-3.5" />
						</span>
						<span class="font-medium">{data.next.title}</span>
					</a>
				{/if}
			</nav>
		{/if}
	</article>

	{#if data.headings.length > 1}
		<aside class="sticky top-24 hidden h-fit w-52 shrink-0 xl:block">
			<nav aria-label="On this page" class="flex flex-col gap-2 text-sm">
				<h2 class="font-medium">On this page</h2>
				<ul class="flex flex-col gap-1.5">
					{#each data.headings as heading (heading.id)}
						<li class={heading.depth === 3 ? 'pl-3' : ''}>
							<a
								href="#{heading.id}"
								class="text-muted-foreground transition-colors hover:text-foreground"
							>
								{heading.text}
							</a>
						</li>
					{/each}
				</ul>
			</nav>
		</aside>
	{/if}
</div>
