<script lang="ts" module>
	import type { WithChildren } from 'bits-ui';
	import type { HTMLAttributes } from 'svelte/elements';

	export type WindowPropsWithoutHTML = WithChildren & {
		contentClass?: string;
	};

	export type WindowProps = HTMLAttributes<HTMLDivElement> & WindowPropsWithoutHTML;
</script>

<script lang="ts">
	import { cn } from '$lib/utils.js';

	let { children, class: className, contentClass }: WindowProps = $props();
</script>

<!--
	Adjusted from the registry default to match the design system: the surface is
	`card` rather than `background`, and the window controls are square, like every
	other corner here. No forced aspect ratio — the content sets the height.
-->
<div class={cn('w-full border border-border bg-card', className)}>
	<div class="border-b border-inherit px-4 py-3.5">
		<div class="flex items-center gap-2">
			<div class="size-2.5 bg-[#ff5f57]"></div>
			<div class="size-2.5 bg-[#febc2e]"></div>
			<div class="size-2.5 bg-[#28c840]"></div>
		</div>
	</div>
	<div class={cn('px-6 py-5.5', contentClass)}>
		{@render children?.()}
	</div>
</div>
