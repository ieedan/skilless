<script lang="ts">
	import SiteFooter from '$lib/components/app/site-footer.svelte';
	import SiteHeader, { SITE_WIDTH } from '$lib/components/app/site-header.svelte';
	import { cn } from '$lib/utils';

	let { data, children } = $props();
</script>

<!-- the shell of anything shared by address: a skill or a pack, readable signed out -->
<div class="flex min-h-dvh flex-col bg-background">
	<SiteHeader signedIn={data.signedIn} />

	<main class={cn('mx-auto w-full flex-1 pb-16', SITE_WIDTH)}>
		{@render children()}
	</main>

	<SiteFooter signedIn={data.signedIn} />
</div>
