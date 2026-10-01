<script lang="ts">
	import { page } from '$app/state';
	import Logo from '$lib/components/app/logo.svelte';
	import { Button } from '$lib/components/ui/button';
	import { APP_NAME } from '$lib/constants';

	/**
	 * What SvelteKit says when a route throws nothing of its own. Replaced here,
	 * because those strings describe the status to a developer.
	 */
	const GENERIC = new Set(['Not Found', 'Internal Error']);

	const status = $derived(page.status);
	const missing = $derived(status === 404);
	const reported = $derived(page.error?.message);
	const specific = $derived(reported && !GENERIC.has(reported) ? reported : undefined);

	const heading = $derived(
		specific ?? (missing ? "This page doesn't exist." : 'Something went wrong.')
	);

	const title = $derived(missing ? `Page not found · ${APP_NAME}` : `${heading} · ${APP_NAME}`);

	/** The address that failed, without a query string full of tokens. */
	const path = $derived(page.url.pathname);
</script>

<svelte:head>
	<title>{title}</title>
</svelte:head>

<div class="relative min-h-dvh bg-background">
	<header
		class="absolute inset-x-0 top-0 mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-6"
	>
		<a
			href="/"
			class="flex rounded-sm py-1 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
		>
			<Logo class="h-3.5" />
		</a>
		<Button href="/docs" variant="ghost" size="sm">Docs</Button>
	</header>

	<main class="flex min-h-dvh items-center justify-center px-6 py-24">
		<div class="flex w-full max-w-3xl flex-col items-center text-center">
			<!--
				The wordmark, applied to the status: a band knocked out of the digits
				and the same rule drawn through the gap, running past either side.
				The proportions follow the logo (cap height 144.4, band from 53.21,
				rule 18.05 thick and centred in the band).
			-->
			<p class="mark">
				<span class="mark-digits">{status}</span>
				<!-- after the digits, so both paint over them -->
				<span class="mark-band" aria-hidden="true"></span>
				<span class="mark-rule" aria-hidden="true"></span>
			</p>

			<h1 class="mt-12 max-w-lg text-2xl font-medium text-balance">{heading}</h1>

			{#if missing}
				<p class="mt-3 max-w-lg truncate font-mono text-base text-muted-foreground" title={path}>
					{path}
				</p>
			{/if}

			<div class="mt-10 flex flex-wrap items-center justify-center gap-3">
				{#if missing}
					<Button href="/">Go home</Button>
				{:else}
					<Button href="{path}{page.url.search}" data-sveltekit-reload>Try again</Button>
					<Button href="/" variant="outline">Go home</Button>
				{/if}
			</div>
		</div>
	</main>
</div>

<style>
	/*
	 * Line box set to Instrument Sans's cap height, so the band and the rule
	 * can use the logo's fractions of that height (viewBox 144.4, band from
	 * 53.21 at 26.3%, rule 18.05 thick and centred in the band).
	 */
	.mark {
		position: relative;
		width: fit-content;
		max-width: 100%;
		font-size: clamp(8rem, 22vw, 14rem);
		font-weight: 600;
		line-height: 0.72;
		letter-spacing: -0.04em;
	}

	.mark-digits {
		display: block;
	}

	.mark-band,
	.mark-rule {
		position: absolute;
		/* 0.2em stays inside the page's px-6, so the rule cannot scroll the page sideways */
		right: -0.2em;
		left: -0.2em;
		pointer-events: none;
	}

	/* knockout, so the rule sits in clear space rather than on the ink */
	.mark-band {
		top: 36.85%;
		height: 26.3%;
		background: var(--background);
	}

	.mark-rule {
		top: 43.75%;
		height: 12.5%;
		background: var(--foreground);
		transform-origin: left center;
		animation: draw-rule 450ms cubic-bezier(0.3, 0, 0.2, 1) both;
	}

	@keyframes draw-rule {
		from {
			transform: scaleX(0);
		}

		to {
			transform: scaleX(1);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.mark-rule {
			animation: none;
		}
	}
</style>
