<script lang="ts">
	import MenuIcon from '@lucide/svelte/icons/menu';
	import { Button } from '$lib/components/ui/button';
	import * as Sheet from '$lib/components/ui/sheet';
	import DocsNav from '$lib/components/docs/docs-nav.svelte';
	import SiteFooter from '$lib/components/app/site-footer.svelte';
	import SiteHeader, { SITE_WIDTH } from '$lib/components/app/site-header.svelte';
	import { cn } from '$lib/utils';

	let { data, children } = $props();

	let menuOpen = $state(false);
</script>

<div class="flex min-h-dvh flex-col bg-background">
	<SiteHeader signedIn={data.signedIn}>
		{#snippet leading()}
			<Sheet.Root bind:open={menuOpen}>
				<Sheet.Trigger>
					{#snippet child({ props })}
						<Button
							{...props}
							variant="ghost"
							size="icon-sm"
							class="lg:hidden"
							aria-label="Open docs menu"
						>
							<MenuIcon />
						</Button>
					{/snippet}
				</Sheet.Trigger>
				<Sheet.Content side="left" class="overflow-y-auto p-6">
					<Sheet.Title class="sr-only">Docs</Sheet.Title>
					<DocsNav onnavigate={() => (menuOpen = false)} />
				</Sheet.Content>
			</Sheet.Root>
		{/snippet}
	</SiteHeader>

	<div class={cn('mx-auto flex w-full flex-1 gap-10', SITE_WIDTH)}>
		<aside
			class="sticky top-16 hidden h-[calc(100dvh-4rem)] w-56 shrink-0 overflow-y-auto py-10 lg:block"
		>
			<DocsNav />
		</aside>

		<div class="min-w-0 flex-1">
			{@render children()}
		</div>
	</div>

	<SiteFooter signedIn={data.signedIn} />
</div>
