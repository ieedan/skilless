<script lang="ts">
	import { unstable_Drawer as DrawerPrimitive } from 'bits-ui';

	let { open = $bindable(false), ...restProps }: DrawerPrimitive.RootProps = $props();
</script>

<DrawerPrimitive.Root bind:open {...restProps} />
