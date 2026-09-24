<script lang="ts">
	import { page } from '$app/state';
	import Current from './landing/current.svelte';
	import Invisible from './landing/invisible.svelte';
	import Library from './landing/library.svelte';
	import Lifecycle from './landing/lifecycle.svelte';

	let { signedIn = false }: { signedIn?: boolean } = $props();

	/**
	 * Homepage candidates, side by side. The pick lives in `?design=` so a
	 * particular one can be linked to; with none given the current page shows.
	 */
	const designs = [
		{ id: 'current', label: 'Current', component: Current },
		{ id: 'library', label: 'Library', component: Library },
		{ id: 'invisible', label: 'Invisible', component: Invisible },
		{ id: 'lifecycle', label: 'Lifecycle', component: Lifecycle }
	];

	const active = $derived(
		designs.find((d) => d.id === page.url.searchParams.get('design')) ?? designs[0]
	);
</script>

<active.component {signedIn} />

<nav
	aria-label="Homepage designs"
	class="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 border border-border bg-popover/90 p-1 shadow-lg backdrop-blur"
>
	{#each designs as design (design.id)}
		<a
			href="?design={design.id}"
			data-sveltekit-replacestate
			aria-current={design.id === active.id ? 'page' : undefined}
			class="rounded-sm px-3 py-1.5 text-sm whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50
				{design.id === active.id
				? 'bg-foreground text-background'
				: 'text-muted-foreground hover:text-foreground'}"
		>
			{design.label}
		</a>
	{/each}
</nav>
