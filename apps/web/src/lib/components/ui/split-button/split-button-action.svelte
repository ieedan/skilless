<script lang="ts" module>
	import type { WithoutChildren } from 'bits-ui';

	export type SplitButtonActionProps = WithoutChildren<ButtonProps> & {
		value: string;
		children?: import('svelte').Snippet;
	};
</script>

<script lang="ts">
	import {
		LoadingButton as Button,
		type LoadingButtonProps as ButtonProps
	} from '$lib/components/ui/loading-button';
	import { useSplitButtonAction } from './split-button.svelte.js';
	import { box } from 'svelte-toolbelt';

	let {
		ref = $bindable(null),
		value,
		onclick,
		disabled,
		loading,
		children,
		...rest
	}: SplitButtonActionProps = $props();

	const state = useSplitButtonAction({
		value: box.with(() => value),
		onclick: box.with(() => onclick)
	});
</script>

{#if state.isActive}
	<Button
		bind:ref
		disabled={disabled || state.rootState.disabled}
		loading={loading || state.rootState.loading}
		onclick={(e) => state.onclick(e)}
		{...rest}
	>
		{@render children?.()}
	</Button>
{/if}
