<script lang="ts">
	import { Checkbox } from '$lib/components/ui/checkbox';

	let {
		checked,
		onCheckedChange,
		label
	}: {
		checked: boolean;
		onCheckedChange: (checked: boolean) => void;
		label: string;
	} = $props();
</script>

<!--
	A cell as wide as the one select-all sits in above the list (and 1px in, for
	that field's border), so the checkboxes line up; the row's content then
	starts level with the search icon. Above a row's stretched link, so a click
	checks rather than opens.
-->
<div class="ml-px flex w-9 shrink-0 justify-center">
	<Checkbox {checked} {onCheckedChange} aria-label={label} class="z-1" />
</div>
