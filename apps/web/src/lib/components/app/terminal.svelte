<script lang="ts">
	import * as Terminal from '$lib/components/ui/terminal';

	/**
	 * A real `skilless init` run, played back. The paths and the project key match
	 * what the CLI actually does (see SPEC.md), so the demo does not promise
	 * behaviour the tool has not got.
	 *
	 * Delays are absolute from the start of the sequence, not relative to the
	 * previous line — Terminal.Root sorts by delay and schedules each one itself.
	 */
	const ok = 'text-chart-2';
	const muted = 'text-muted-foreground';
</script>

<!--
	Height is pinned so the box does not grow as lines animate in. 328px is the
	finished height: 39 header + 287 content (10 lines at 13px/1.5, three 16px
	gaps, 22px padding top and bottom). Line-height is a ratio, so this holds
	whatever the font does. Lines never wrap — they scroll, like a real terminal —
	which keeps the height constant at every viewport.
-->
<Terminal.Root
	class="h-[328px] max-w-[860px] text-[13px] leading-normal"
	contentClass="overflow-x-auto whitespace-nowrap"
>
	<Terminal.TypingAnimation class="text-foreground">$ npx skilless init</Terminal.TypingAnimation>

	<Terminal.AnimatedSpan delay={1400} class="{ok} mt-4">
		✔ Authenticated as ieedan
	</Terminal.AnimatedSpan>
	<Terminal.AnimatedSpan delay={1750} class={ok}>
		✔ Project&nbsp;&nbsp;github.com/ieedan/skilless
	</Terminal.AnimatedSpan>
	<Terminal.AnimatedSpan delay={2100} class={ok}>✔ Resolved 3 bound skills</Terminal.AnimatedSpan>

	<Terminal.AnimatedSpan delay={2350} class={muted}
		>&nbsp;&nbsp;&nbsp;&nbsp;animate</Terminal.AnimatedSpan
	>
	<Terminal.AnimatedSpan delay={2550} class={muted}>
		&nbsp;&nbsp;&nbsp;&nbsp;resolve-comments
	</Terminal.AnimatedSpan>
	<Terminal.AnimatedSpan delay={2750} class={muted}>
		&nbsp;&nbsp;&nbsp;&nbsp;update-deps
	</Terminal.AnimatedSpan>

	<Terminal.AnimatedSpan delay={3150} class="{ok} mt-4">
		✔ Linked .agents/skills&nbsp;&nbsp;→&nbsp;&nbsp;~/.skilless/skills
	</Terminal.AnimatedSpan>
	<Terminal.AnimatedSpan delay={3500} class={ok}>
		✔ Linked .claude/skills&nbsp;&nbsp;→&nbsp;&nbsp;../../.agents/skills
	</Terminal.AnimatedSpan>

	<Terminal.AnimatedSpan delay={3900} class="{muted} mt-4">Done in 1.2s</Terminal.AnimatedSpan>
</Terminal.Root>
