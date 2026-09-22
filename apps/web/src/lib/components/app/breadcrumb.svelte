<script lang="ts" module>
	export type Crumb = { label: string; href?: string; icon?: string; iconClass?: string };
</script>

<script lang="ts">
	let { items }: { items: Crumb[] } = $props();
</script>

<nav aria-label="Breadcrumb" class="flex items-center gap-2.5 font-mono text-sm">
	{#each items as item, i (item.label + i)}
		{@const last = i === items.length - 1}

		<span class="flex items-center gap-1.5">
			{#if item.icon}
				<i class="{item.icon} {item.iconClass} shrink-0 text-base leading-none" aria-hidden="true"
				></i>
			{/if}

			{#if last || !item.href}
				<span class="text-foreground" aria-current={last ? 'page' : undefined}>{item.label}</span>
			{:else}
				<a href={item.href} class="text-muted-foreground transition-colors hover:text-foreground">
					{item.label}
				</a>
			{/if}
		</span>

		{#if !last}
			<i
				class="ri-arrow-right-s-line text-base leading-none text-muted-foreground"
				aria-hidden="true"
			></i>
		{/if}
	{/each}
</nav>
