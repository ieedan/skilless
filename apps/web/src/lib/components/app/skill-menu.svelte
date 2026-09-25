<script lang="ts" module>
	import { IsMobile } from '$lib/hooks/is-mobile.svelte';

	// one listener shared by every row's menu
	const mobile = new IsMobile();
</script>

<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import SkillMenuDrawer from './skill-menu-drawer.svelte';
	import SkillMenuDropdown from './skill-menu-dropdown.svelte';

	/** A dropdown on desktop, a stack of drawers on phones. */
	let props: ComponentProps<typeof SkillMenuDropdown> = $props();
</script>

{#if mobile.current}
	<SkillMenuDrawer {...props} />
{:else}
	<SkillMenuDropdown {...props} />
{/if}
