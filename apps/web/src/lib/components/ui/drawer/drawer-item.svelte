<script lang="ts" module>
	export const drawerItemClass =
		"group/drawer-item flex w-full cursor-default items-center gap-3 rounded-md px-2 py-2.5 text-left text-sm outline-hidden select-none hover:bg-accent focus-visible:bg-accent focus-visible:text-accent-foreground disabled:pointer-events-none disabled:opacity-50 data-[variant=destructive]:text-destructive data-[variant=destructive]:hover:bg-destructive/10 data-[variant=destructive]:focus-visible:bg-destructive/10 dark:data-[variant=destructive]:hover:bg-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground data-[variant=destructive]:[&_svg]:text-destructive";
</script>

<script lang="ts">
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	/** A row in a drawer menu: a link when given an `href`, a button otherwise. */
	let {
		ref = $bindable(null),
		class: className,
		variant = 'default',
		href,
		children,
		...restProps
	}: WithElementRef<HTMLButtonAttributes & HTMLAnchorAttributes> & {
		variant?: 'default' | 'destructive';
	} = $props();
</script>

{#if href}
	<a
		bind:this={ref}
		{href}
		data-slot="drawer-item"
		data-variant={variant}
		class={cn(drawerItemClass, className)}
		{...restProps as HTMLAnchorAttributes}
	>
		{@render children?.()}
	</a>
{:else}
	<button
		bind:this={ref}
		type="button"
		data-slot="drawer-item"
		data-variant={variant}
		class={cn(drawerItemClass, className)}
		{...restProps as HTMLButtonAttributes}
	>
		{@render children?.()}
	</button>
{/if}
