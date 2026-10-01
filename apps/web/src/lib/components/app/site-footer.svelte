<script lang="ts">
	import { APP_NAME } from '$lib/constants';
	import { cn } from '$lib/utils';
	import Logo from './logo.svelte';

	/** The footer shared by the marketing page and the docs. */
	let {
		signedIn = false,
		class: className
	}: {
		signedIn?: boolean;
		/** For the inner container, so it lines up with the page above it. */
		class?: string;
	} = $props();

	const year = new Date().getFullYear();

	const groups = $derived([
		{
			title: 'Docs',
			links: [
				{ label: 'Introduction', href: '/docs' },
				{ label: 'Quick start', href: '/docs/quick-start' },
				{ label: 'CLI reference', href: '/docs/cli' }
			]
		},
		{
			title: 'Cloud',
			links: [
				signedIn ? { label: 'Dashboard', href: '/my-skills' } : { label: 'Log in', href: '/login' },
				{ label: 'Sync', href: '/docs/cloud/sync' },
				{ label: 'Cloud agents', href: '/docs/cloud/cloud-agents' }
			]
		},
		{
			title: 'Project',
			links: [
				{ label: 'GitHub', href: 'https://github.com/ieedan/skilless' },
				{ label: 'npm', href: 'https://www.npmjs.com/package/skilless' }
			]
		}
	]);
</script>

<footer class="border-t border-border">
	<div
		class={cn(
			'mx-auto flex w-full max-w-5xl flex-col gap-12 px-6 py-14 md:flex-row md:justify-between',
			className
		)}
	>
		<div class="flex flex-col gap-4">
			<!-- `/` sends signed-in visitors to the app; the marketing page is /home for them -->
			<a href={signedIn ? '/home' : '/'} class="flex w-fit py-1" aria-label="{APP_NAME} home">
				<Logo class="h-3.5" />
			</a>
			<p class="text-sm text-muted-foreground">© {year} {APP_NAME}</p>
		</div>

		<nav aria-label="Footer" class="grid grid-cols-2 gap-x-12 gap-y-8 sm:grid-cols-3">
			{#each groups as group (group.title)}
				<div class="flex flex-col gap-3">
					<h2 class="text-sm font-medium">{group.title}</h2>
					<ul class="flex flex-col gap-2">
						{#each group.links as link (link.href)}
							<li>
								<a
									href={link.href}
									class="text-sm text-muted-foreground transition-colors hover:text-foreground"
								>
									{link.label}
								</a>
							</li>
						{/each}
					</ul>
				</div>
			{/each}
		</nav>
	</div>
</footer>
