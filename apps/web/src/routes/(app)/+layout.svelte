<script lang="ts">
	import { page } from '$app/state';
	import AppSidebar from '$lib/components/app/app-sidebar.svelte';
	import Breadcrumb from '$lib/components/app/breadcrumb.svelte';
	import { iconFor } from '$lib/components/app/file-icon.svelte';
	import { provideHeaderActions } from '$lib/components/app/header-actions.svelte';
	import { ConfirmDeleteDialog } from '$lib/components/ui/confirm-delete-dialog';

	let { children, data } = $props();

	const headerActions = provideHeaderActions();

	const SECTIONS: Record<string, string> = {
		skills: 'Skills',
		tokens: 'Tokens',
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
					icon: file?.icon ?? (folder ? 'ri-folder-3-fill' : undefined),
					iconClass: file?.class ?? (folder ? 'text-sky-300/80' : undefined)
				};
			})
		];
	});
</script>

<!--
	The shell from the design: a sidebar and header wrapping a content panel that
	floats on the page background, inset from the right and bottom edges.
-->
<div class="flex h-dvh">
	<AppSidebar user={data.user} />

	<div class="flex min-w-0 flex-1 flex-col pr-5 pb-5">
		<header class="flex h-14 shrink-0 items-center justify-between gap-4">
			<Breadcrumb items={crumbs} />

			{#if headerActions.current}
				<div class="flex shrink-0 items-center gap-2">{@render headerActions.current()}</div>
			{/if}
		</header>

		<!--
			The panel spans the full width; each page decides its own measure. Reading
			views cap themselves (see ReadingColumn) while the file editor takes the
			whole width, which is what you want for code.
		-->
		<main class="min-h-0 flex-1 overflow-y-auto border border-border bg-card">
			{@render children()}
		</main>
	</div>
</div>

<!-- one instance backs every confirmDelete() call in this group -->
<ConfirmDeleteDialog />
