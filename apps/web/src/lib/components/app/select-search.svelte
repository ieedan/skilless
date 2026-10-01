<script lang="ts">
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { listSearch } from '$lib/list-nav';
	import { cn } from '$lib/utils';
	import SearchInput from './search-input.svelte';

	/**
	 * Select-all and search as one field. The checkbox's cell is the same width
	 * as a RowCheckbox's, so every checkbox sits on one line. The ring follows
	 * the text field only: checking the box is not typing.
	 */
	let {
		value = $bindable(''),
		checked,
		indeterminate,
		onCheckedChange,
		selectLabel,
		placeholder,
		label,
		class: className
	}: {
		value?: string;
		checked: boolean;
		indeterminate: boolean;
		onCheckedChange: (checked: boolean) => void;
		/** For the checkbox, e.g. "Select all shown skills". */
		selectLabel: string;
		placeholder: string;
		/** For the text field. */
		label: string;
		class?: string;
	} = $props();
</script>

<div
	class={cn(
		'flex h-8 min-w-0 items-center rounded-lg border border-input shadow-xs transition-colors has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-3 has-[input:focus-visible]:ring-ring/50',
		className
	)}
>
	<div
		class="relative flex h-full w-9 shrink-0 items-center justify-center after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-input"
	>
		<Checkbox {checked} {indeterminate} {onCheckedChange} aria-label={selectLabel} />
	</div>
	<SearchInput
		{placeholder}
		aria-label={label}
		{...listSearch}
		class="h-full min-w-0 flex-1"
		inputClass="h-full rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
		bind:value
	/>
</div>
