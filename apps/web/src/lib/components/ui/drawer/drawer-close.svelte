<script lang="ts">
	import { unstable_Drawer as DrawerPrimitive } from 'bits-ui';

	let { ref = $bindable(null), ...restProps }: DrawerPrimitive.CloseProps = $props();
</script>

<DrawerPrimitive.Close bind:ref data-slot="drawer-close" {...restProps} />
