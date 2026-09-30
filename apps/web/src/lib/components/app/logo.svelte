<script lang="ts" module>
	/** The full wordmark's width over its height (the viewBox). */
	export const WORDMARK_RATIO = 663.89 / 144.4;

	/**
	 * The S alone, with the rule running an even distance past either side of it,
	 * as in the favicon: from the viewBox's left edge (-41.44) to as far past the
	 * S's right edge (103.4) as that is before its left (0).
	 */
	export const MARK_RATIO = (103.4 + 41.44 * 2) / 144.4;
</script>

<script lang="ts">
	import { APP_NAME } from '$lib/constants';

	/**
	 * The wordmark: SKILL, struck through — the name read as "skill-less".
	 *
	 * The glyphs are outlines of IBM Plex Mono SemiBold, not live text, so the
	 * mark does not depend on the font being loaded or installed. The rule does
	 * not sit on top of the letters: a band is knocked out of them, leaving clear
	 * space either side, so the mark works on any background.
	 *
	 * Geometry is normalised to the cap band (all caps, so the ink box is the cap
	 * height): set a height and the width follows.
	 *
	 * A `foldable` logo folds down to the S, the favicon's mark, as far as
	 * `--logo-fold` says: 0 is the wordmark, 1 the S, and anything between is
	 * part way, so a parent can tie it to scrolling. The viewBox never changes:
	 * the SVG narrows and `slice` crops it from the right, so the rule shortens
	 * with it while KILL fades out ahead of the edge. A width cannot be worked
	 * out from an element's own height in CSS, so a foldable logo takes its
	 * height from `--logo-h` instead of a height class.
	 */
	let { class: className = 'h-3.5', foldable = false }: { class?: string; foldable?: boolean } =
		$props();

	// unique per instance — two logos on one page must not share a mask id
	const uid = $props.id();
	const maskId = `logo-cut-${uid}`;
</script>

<svg
	viewBox="-41.44 0 663.89 144.4"
	preserveAspectRatio="xMinYMid slice"
	fill="none"
	role="img"
	aria-label={APP_NAME}
	class={['shrink-0', foldable ? 'h-(--logo-h)' : ['w-auto', className]]}
	style:width={foldable
		? `calc(var(--logo-h) * (${WORDMARK_RATIO} - ${WORDMARK_RATIO - MARK_RATIO} * var(--logo-fold, 0)))`
		: undefined}
>
	<defs>
		<mask id={maskId} maskUnits="userSpaceOnUse" x="-41.44" y="0" width="663.89" height="144.4">
			<rect x="-41.44" y="0" width="663.89" height="144.4" fill="#fff" />
			<!-- the rule plus its padding, removed from the glyphs -->
			<rect x="-41.44" y="53.21" width="663.89" height="37.98" fill="#000" />
		</mask>
	</defs>

	<g mask="url(#{maskId})" fill="currentColor">
		<!-- S -->
		<path
			d="M51.4 144.4L51.4 144.4Q33.4 144.4 20.7 138.2Q8 132 0 121.8L0 121.8L15.8 105.4Q23.6 114.4 32.7 118.7Q41.8 123 52.2 123L52.2 123Q64.2 123 70.6 117.6Q77 112.2 77 102L77 102Q77 93.6 72.2 89.3Q67.4 85 56 83.2L56 83.2L41.2 80.8Q21.8 77.4 13.6 66.7Q5.4 56 5.4 41.4L5.4 41.4Q5.4 21.4 18.4 10.7Q31.4 0 54.4 0L54.4 0Q70.8 0 82.7 5.2Q94.6 10.4 101.8 19.4L101.8 19.4L86.4 35.8Q80.8 29.2 73 25.3Q65.2 21.4 54.6 21.4L54.6 21.4Q31.8 21.4 31.8 40.2L31.8 40.2Q31.8 48.2 36.6 52.4Q41.4 56.6 53 58.6L53 58.6L67.6 61.2Q85.8 64.6 94.6 74.6Q103.4 84.6 103.4 100.2L103.4 100.2Q103.4 110 100 118.1Q96.6 126.2 90 132.1Q83.4 138 73.7 141.2Q64 144.4 51.4 144.4"
		/>
		<!-- KILL -->
		<!-- gone by halfway, before the crop reaches the S -->
		<path
			style:opacity={foldable ? 'calc(1 - var(--logo-fold, 0) * 2)' : undefined}
			d="M202.6 142L168.4 80.8L153.8 100L153.8 142L127.6 142L127.6 2.4L153.8 2.4L153.8 65.2L155 65.2L171.2 42L200.6 2.4L230.2 2.4L186.4 61.2L232.2 142L202.6 142M337.4 142L248.6 142L248.6 122.4L280 122.4L280 22L248.6 22L248.6 2.4L337.4 2.4L337.4 22L306 22L306 122.4L337.4 122.4L337.4 142M461 142L373 142L373 2.4L399.2 2.4L399.2 120.4L461 120.4L461 142M581 142L493 142L493 2.4L519.2 2.4L519.2 120.4L581 120.4L581 142"
		/>
	</g>

	<rect x="-41.44" y="63.18" width="663.89" height="18.05" fill="currentColor" />
</svg>
