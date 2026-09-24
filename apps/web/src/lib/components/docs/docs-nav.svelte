<script lang="ts">
	import { page } from '$app/state';
	import { href, nav } from '$lib/docs';

	let { onnavigate }: { onnavigate?: () => void } = $props();

	const current = $derived(page.url.pathname.replace(/\/$/, ''));
</script>

<nav aria-label="Docs" class="flex flex-col gap-7">
	{#each nav as section (section.title)}
		<div class="flex flex-col gap-1.5">
			<h2 class="px-2 text-xs font-medium text-muted-foreground">{section.title}</h2>
			<ul class="flex flex-col">
				{#each section.pages as doc (doc.slug)}
					{@const active = current === href(doc.slug)}
					<li>
						<a
							href={href(doc.slug)}
							onclick={onnavigate}
							aria-current={active ? 'page' : undefined}
							class="block rounded-md px-2 py-1.5 text-sm transition-colors
								{active
								? 'bg-accent font-medium text-accent-foreground'
								: 'text-muted-foreground hover:text-foreground'}"
						>
							{doc.title}
						</a>
					</li>
				{/each}
			</ul>
		</div>
	{/each}
</nav>
