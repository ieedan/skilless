<script lang="ts">
	import { useModalSub } from './modal.svelte.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Drawer from '$lib/components/ui/drawer/index.js';
	import type { DialogContentProps } from 'bits-ui';

	const modal = useModalSub();

	let {
		ref = $bindable(null),
		showCloseButton = true,
		children,
		...rest
	}: DialogContentProps & { showCloseButton?: boolean } = $props();
</script>

{#if modal.view === 'desktop'}
	<Dialog.Content bind:ref {showCloseButton} {...rest}>
		{@render children?.()}
	</Dialog.Content>
{:else}
	<Drawer.Content bind:ref {...rest}>
		<!-- the drawer's items bring their own inset; a form's fields need it given -->
		<div class="px-2 **:data-[slot=drawer-footer]:px-0 **:data-[slot=drawer-header]:px-0">
			{@render children?.()}
		</div>
	</Drawer.Content>
{/if}
