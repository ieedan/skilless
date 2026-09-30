<script lang="ts" module>
	import { IsMobile } from '$lib/hooks/is-mobile.svelte';

	const mobile = new IsMobile();
</script>

<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import UserMenuDrawer from './user-menu-drawer.svelte';
	import UserMenuDropdown from './user-menu-dropdown.svelte';

	/** A dropdown on desktop, a drawer on phones, like the other menus. */
	let props: ComponentProps<typeof UserMenuDropdown> = $props();
</script>

{#if mobile.current}
	<UserMenuDrawer {...props} />
{:else}
	<UserMenuDropdown {...props} />
{/if}
