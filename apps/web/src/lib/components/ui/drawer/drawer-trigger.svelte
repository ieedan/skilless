<script lang="ts">
	import { unstable_Drawer as DrawerPrimitive } from 'bits-ui';

	let { ref = $bindable(null), ...restProps }: DrawerPrimitive.TriggerProps = $props();
</script>

<DrawerPrimitive.Trigger bind:ref data-slot="drawer-trigger" {...restProps} />
