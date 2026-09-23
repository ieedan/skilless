<script lang="ts">
	import { page } from '$app/state';
	import AppSidebar from '$lib/components/app/app-sidebar.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import Breadcrumb from '$lib/components/app/breadcrumb.svelte';
	import { iconFor } from '$lib/components/app/file-icon.svelte';
	import { projectParts } from '$lib/project';
	import RiFolder3Fill from 'remixicon-svelte/icons/folder-3-fill';
	import { provideHeaderActions } from '$lib/components/app/header-actions.svelte';
	import { ConfirmDeleteDialog } from '$lib/components/ui/confirm-delete-dialog';

	let { children, data } = $props();

	const headerActions = provideHeaderActions();

	const SECTIONS: Record<string, string> = {
		skills: 'Skills',
		projects: 'Projects',
		settings: 'Settings',
		account: 'Account'
	};

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
				{ label: SECTIONS.projects, href: '/projects' },
				{ label: projectParts(key).path, href: `/projects/${key}` }
			];
		}

		return [
			{ label: SECTIONS[section] ?? section, href: `/${section}` },
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

<!--
	The shell from the design: a tinted sidebar beside a full-bleed content area,
	with the breadcrumbs in a header ruled off from the page below. Below `md`
	the sidebar becomes a sheet, opened from the button before the breadcrumbs.

	`data-surface` names the surface this shell fills the viewport with, so the
	page canvas — and with it the browser chrome a phone paints from it — sits on
	--card alongside it rather than on the default --background (see layout.css).
-->
<Sidebar.Provider data-surface="card" class="h-dvh min-h-0 bg-card" style="--sidebar-width: 15rem;">
	<AppSidebar user={data.user} />

	<Sidebar.Inset class="min-w-0 bg-card">
		<header
			class="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border px-4 md:px-6"
		>
			<div class="flex min-w-0 items-center gap-2">
				<Sidebar.Trigger class="-ml-1.5 text-muted-foreground md:hidden" />
				<Breadcrumb items={crumbs} />
			</div>

			{#if headerActions.current}
				<div class="flex shrink-0 items-center gap-2">{@render headerActions.current()}</div>
			{/if}
		</header>

		<!--
			The content spans the full width; each page decides its own measure. Reading
			views cap themselves (see ReadingColumn) while the file editor takes the
			whole width, which is what you want for code.
		-->
		<div class="min-h-0 flex-1 overflow-y-auto">
			{@render children()}
		</div>
	</Sidebar.Inset>
</Sidebar.Provider>

<!-- one instance backs every confirmDelete() call in this group -->
<ConfirmDeleteDialog />
