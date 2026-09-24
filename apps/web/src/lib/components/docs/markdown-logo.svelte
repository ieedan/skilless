<script lang="ts">
	// Markdown mark from svgl (https://svgl.app), recoloured to currentColor so one copy
	// serves both themes.
	let { class: className = 'size-4' }: { class?: string } = $props();
</script>

<svg viewBox="0 0 208 128" fill="currentColor" aria-hidden="true" class={className}>
	<path
		fill-rule="evenodd"
		clip-rule="evenodd"
		d="M15 10a5 5 0 0 0-5 5v98a5 5 0 0 0 5 5h178a5 5 0 0 0 5-5V15a5 5 0 0 0-5-5zM0 15A15 15 0 0 1 15 0h178a15 15 0 0 1 15 15v98a15 15 0 0 1-15 15H15a15 15 0 0 1-15-15z"
	/>
	<path d="M30 98V30h20l20 25 20-25h20v68H90V59L70 84 50 59v39zm125 0-30-33h20V30h20v35h20z" />
</svg>
