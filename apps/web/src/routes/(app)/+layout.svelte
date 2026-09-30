<script lang="ts">
	import { page } from '$app/state';
	import * as NavTabs from '$lib/components/ui/nav-tabs';
	import Logo, { MARK_RATIO, WORDMARK_RATIO } from '$lib/components/app/logo.svelte';
	import UserMenu from '$lib/components/app/user-menu.svelte';
	import { Button } from '$lib/components/ui/button';
	import Breadcrumb from '$lib/components/app/breadcrumb.svelte';
	import { iconFor } from '$lib/components/app/file-icon.svelte';
	import { projectParts } from '$lib/project';
	import RiFolder3Fill from 'remixicon-svelte/icons/folder-3-fill';
	import { provideHeaderActions } from '$lib/components/app/header-actions.svelte';
	import { ConfirmDeleteDialog } from '$lib/components/ui/confirm-delete-dialog';

	let { children, data } = $props();

	const headerActions = provideHeaderActions();

	const SECTIONS = [
		{ href: '/skills', label: 'Skills' },
		{ href: '/projects', label: 'Projects' },
		{ href: '/settings', label: 'Settings' }
	];

	const sectionLabel = (section: string) =>
		SECTIONS.find((s) => s.href === `/${section}`)?.label ?? section;

	/** The height of the row above the tabs, which scrolls away (h-12). */
	const TOP_ROW = 48;
	/** How far the logo and avatar travel, from the top row's middle to the tabs row's (h-11). */
	const TRAVEL = TOP_ROW / 2 + 44 / 2;

	let scrollY = $state(0);
	/**
	 * How far through the top row the page has scrolled, 0 to 1. The logo's
	 * fold, and its and the avatar's move into the tabs row, follow it frame by
	 * frame rather than playing once past a threshold.
	 */
	const progress = $derived(Math.min(Math.max(scrollY / TOP_ROW, 0), 1));

	/** The edges everything lines up on: the header, the path under it and the page. */
	const column = 'w-full px-4 md:px-6';

	/**
	 * Derived from the URL rather than pushed up from each page: every route in
	 * this group is a straight path of segments, so there is nothing a page
	 * could add that the URL does not already say.
	 */
	const crumbs = $derived.by(() => {
		const segments = page.url.pathname.split('/').filter(Boolean);
		if (segments.length === 0) return [];

		const [section, ...rest] = segments;

		// A project key is a path of its own (`github.com/owner/repo`) whose
		// segments are not pages, so it is one crumb.
		if (section === 'projects' && rest.length > 0) {
			const key = rest.map(decodeURIComponent).join('/');
			return [
				{ label: sectionLabel('projects'), href: '/projects' },
				{ label: projectParts(key).path, href: `/projects/${key}` }
			];
		}

		return [
			{ label: sectionLabel(section), href: `/${section}` },
			...rest.map((segment, i) => {
				const label = decodeURIComponent(segment);

				// Inside a skill, a segment with an extension is a file and anything
				// else is a directory. `rest[0]` is the skill itself, so it gets
				// neither. Good enough for an icon; the route does the real resolving.
				const inSkill = section === 'skills' && i > 0;
				const file = inSkill && label.includes('.') ? iconFor(label) : undefined;
				const folder = inSkill && !label.includes('.');

				return {
					label,
					href: `/${[section, ...rest.slice(0, i + 1)].join('/')}`,
					mono: section === 'skills' && i === 0,
					icon: file?.icon ?? (folder ? RiFolder3Fill : undefined),
					iconClass: file?.class ?? (folder ? 'text-sky-500 dark:text-sky-300/80' : undefined)
				};
			})
		];
	});
</script>

<svelte:window bind:scrollY />

<!--
	The header is two rows, sticky at minus the top one's height: the top row
	scrolls away and the tabs row holds the top. The logo and avatar are one of
	each, placed over the header and moved down against its scroll, so they
	glide from the top row into the tabs row while the wordmark folds to its S.
	The tabs make room for them as they arrive. The path to the page follows
	the wordmark in the top row; the page's own actions end the tabs row.

	`data-surface` names the surface this shell fills the viewport with, so the
	page canvas (and with it the browser chrome a phone paints from it) sits on
	--card alongside it rather than on the default --background (see layout.css).
-->
<div data-surface="card" class="flex min-h-dvh flex-col bg-card">
	<header
		class="sticky -top-12 z-40 border-b border-border bg-card"
		style:--logo-fold={progress}
		style:--travel="{progress * TRAVEL}px"
	>
		<div class={column}>
			<div class="relative [--logo-h:0.875rem]">
				<!--
					Where you are below the section, after the wordmark (which sits over
					the start of this row). The section itself is the active tab, so the
					path starts under it.
				-->
				<div
					class="flex h-12 min-w-0 items-center gap-3 pr-12"
					style:padding-left="calc(var(--logo-h) * {WORDMARK_RATIO} + 0.75rem)"
				>
					{#if crumbs.length > 1}
						<span class="text-muted-foreground/60 select-none" aria-hidden="true">/</span>
						<Breadcrumb items={crumbs.slice(1)} />
					{/if}

					<!-- beside the avatar, and scrolls away with this row rather than following it down -->
					<Button
						href="/docs"
						variant="ghost"
						size="sm"
						class="ml-auto shrink-0 text-muted-foreground"
					>
						Docs
					</Button>
				</div>

				<!--
					Room for the S (its width plus a gap) and the avatar (32px plus a gap),
					grown as they arrive. Pulled 1px down over the header's rule, so the
					active tab's underline sits on it rather than just above it.
				-->
				<div
					class="-mb-px flex h-11 items-center"
					style:padding-left="calc(var(--logo-fold) * (var(--logo-h) * {MARK_RATIO} + 0.75rem))"
					style:padding-right="calc(var(--logo-fold) * 2.75rem)"
				>
					<NavTabs.Root aria-label="Main" class="min-w-0 flex-1">
						{#each SECTIONS as section (section.href)}
							<NavTabs.Link href={section.href} active={page.url.pathname.startsWith(section.href)}>
								{section.label}
							</NavTabs.Link>
						{/each}
					</NavTabs.Root>

					<!-- in the sticky row, so Save and the like stay in reach however far the page scrolls -->
					{#if headerActions.current}
						<div class="ml-3 flex shrink-0 items-center gap-2">
							{@render headerActions.current()}
						</div>
					{/if}
				</div>

				<a
					href="/skills"
					class="absolute top-2 left-0 flex h-8 translate-y-(--travel) items-center rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
				>
					<Logo foldable />
				</a>

				<div class="absolute top-2 right-0 flex translate-y-(--travel)">
					<UserMenu user={data.user} hideEmail={data.preferences.hideEmail} />
				</div>
			</div>
		</div>

		<!--
			The page dissolves before it reaches the header's rule. The same idea as
			shadcn-svelte's `scroll-fade-t`, which masks a scroller's
			own content; the window is the scroller here, and masking that would take
			the header with it. Over a solid --card, a --card-to-clear gradient reads
			the same as a mask. It fades in as the header sticks, since until then
			nothing is passing under it. Placed 1px past 100%: an absolute child
			measures from inside its parent's border, so at 100% it would cover the rule.
		-->
		<div
			aria-hidden="true"
			class="pointer-events-none absolute inset-x-0 top-[calc(100%+1px)] h-8 bg-linear-to-b from-card to-transparent"
			style:opacity={progress}
		></div>
	</header>

	<main class={[column, 'flex flex-1 flex-col pb-10']}>
		{@render children()}
	</main>
</div>

<!-- one instance backs every confirmDelete() call in this group -->
<ConfirmDeleteDialog />
