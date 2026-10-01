<script lang="ts">
	import { isValidName, NAME_RULES } from '$lib/skill';
	import { Input } from '$lib/components/ui/input';

	/**
	 * A name for a skill or a pack, which become addresses: lowercase, and the
	 * rules shown only once the name actually breaks one. Capitals are folded as
	 * they are typed rather than flagged.
	 */
	let {
		id,
		value = $bindable(''),
		name = 'name',
		placeholder
	}: { id: string; value?: string; name?: string; placeholder?: string } = $props();

	const invalid = $derived(value.length > 0 && !isValidName(value));
	const rulesId = $derived(`${id}-rules`);

	function lowercase(event: Event & { currentTarget: HTMLInputElement }) {
		const input = event.currentTarget;
		const lower = input.value.toLowerCase();
		if (lower === input.value) return;
		const { selectionStart, selectionEnd } = input;
		input.value = lower;
		input.setSelectionRange(selectionStart, selectionEnd);
		value = lower;
	}
</script>

<Input
	{id}
	{name}
	{placeholder}
	autocomplete="off"
	spellcheck="false"
	bind:value
	oninput={lowercase}
	aria-invalid={invalid}
	aria-describedby={invalid ? rulesId : undefined}
/>
{#if invalid}
	<p id={rulesId} class="text-xs text-destructive">{NAME_RULES}</p>
{/if}
