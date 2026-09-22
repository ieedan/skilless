<script lang="ts">
	import { page } from '$app/state';
	import Avatar from './avatar.svelte';
	import Logo from './logo.svelte';

	import type { AppUser } from '$lib/user';

	let { user }: { user: AppUser } = $props();

	const links = [
		{ href: '/skills', label: 'Skills', icon: 'ri-code-s-slash-line' },
		{ href: '/tokens', label: 'Tokens', icon: 'ri-key-2-line' }
	];

	const onAccount = $derived(page.url.pathname.startsWith('/account'));
</script>

<aside class="flex w-60 shrink-0 flex-col justify-between px-4 py-5.5">
	<div class="flex flex-col gap-7">
		<a href="/skills" class="flex px-3 py-1">
			<Logo class="h-3.5" />
		</a>

		<nav class="flex flex-col gap-0.5">
			{#each links as link (link.href)}
				{@const active = page.url.pathname.startsWith(link.href)}
				<a
					href={link.href}
					aria-current={active ? 'page' : undefined}
					class="flex items-center gap-2.5 px-3 py-2 text-sm transition-colors {active
						? 'bg-secondary text-foreground'
						: 'text-muted-foreground hover:text-foreground'}"
				>
					<i class="{link.icon} text-base leading-none" aria-hidden="true"></i>
					{link.label}
				</a>
			{/each}
		</nav>
	</div>

	<a
		href="/account"
		aria-current={onAccount ? 'page' : undefined}
		class="flex items-center gap-2.5 p-2 transition-colors {onAccount
			? 'bg-secondary'
			: 'hover:bg-secondary/50'}"
	>
		<Avatar seed={user.seed} size={28} />
		<span class="flex min-w-0 flex-col">
			<span class="truncate text-[13px] text-card-foreground">{user.name}</span>
			{#if user.subtitle}
				<span class="truncate font-mono text-xs text-muted-foreground">{user.subtitle}</span>
			{/if}
		</span>
	</a>
</aside>
