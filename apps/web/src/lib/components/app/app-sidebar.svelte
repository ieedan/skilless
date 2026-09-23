<script lang="ts">
	import { page } from '$app/state';
	import RiCodeSSlashLine from 'remixicon-svelte/icons/code-s-slash-line';
	import RiSettings3Line from 'remixicon-svelte/icons/settings-3-line';
	import RiUser3Line from 'remixicon-svelte/icons/user-3-line';
	import { afterNavigate } from '$app/navigation';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import Avatar from './avatar.svelte';
	import Logo from './logo.svelte';

	import type { AppUser } from '$lib/user';

	let { user }: { user: AppUser } = $props();

	const links = [
		{ href: '/skills', label: 'Skills', icon: RiCodeSSlashLine },
		{ href: '/settings', label: 'Settings', icon: RiSettings3Line },
		{ href: '/account', label: 'Account', icon: RiUser3Line }
	];

	const sidebar = Sidebar.useSidebar();

	// on mobile the sidebar is a sheet over the page; picking somewhere to go should put it away
	afterNavigate(() => sidebar.setOpenMobile(false));
</script>

<Sidebar.Root>
	<Sidebar.Header class="px-4 py-0">
		<a href="/skills" class="flex h-14 items-center px-3">
			<Logo class="h-3.5" />
		</a>
	</Sidebar.Header>

	<Sidebar.Content class="px-4 pt-4">
		<Sidebar.Menu class="gap-0.5">
			{#each links as link (link.href)}
				{@const Icon = link.icon}
				{@const active = page.url.pathname.startsWith(link.href)}
				<Sidebar.MenuItem>
					<Sidebar.MenuButton isActive={active}>
						{#snippet child({ props })}
							<a href={link.href} aria-current={active ? 'page' : undefined} {...props}>
								<Icon aria-hidden="true" />
								<span>{link.label}</span>
							</a>
						{/snippet}
					</Sidebar.MenuButton>
				</Sidebar.MenuItem>
			{/each}
		</Sidebar.Menu>
	</Sidebar.Content>

	<Sidebar.Footer class="px-4 pb-4">
		<a
			href="/account"
			class="flex items-center gap-2.5 rounded-lg p-2 transition-colors hover:bg-sidebar-accent/50"
		>
			<Avatar seed={user.seed} size={28} />
			<span class="flex min-w-0 flex-col">
				<span class="truncate text-[13px] text-card-foreground">{user.name}</span>
				{#if user.subtitle}
					<span class="truncate text-xs text-muted-foreground">{user.subtitle}</span>
				{/if}
			</span>
		</a>
	</Sidebar.Footer>
</Sidebar.Root>
