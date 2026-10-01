<script lang="ts">
	import type { Entry } from '$lib/files';
	import { listRow } from '$lib/list-nav';
	import { submitAction } from '$lib/submit';
	import { confirmDelete } from '$lib/components/ui/confirm-delete-dialog';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Button } from '$lib/components/ui/button';
	import RiDeleteBinLine from 'remixicon-svelte/icons/delete-bin-line';
	import RiFileCopyLine from 'remixicon-svelte/icons/file-copy-line';
	import RiFolder3Fill from 'remixicon-svelte/icons/folder-3-fill';
	import RiFolderOpenLine from 'remixicon-svelte/icons/folder-open-line';
	import RiMoreFill from 'remixicon-svelte/icons/more-fill';
	import RiPencilLine from 'remixicon-svelte/icons/pencil-line';
	import FileIcon from './file-icon.svelte';
	import { copyText } from '$lib/hooks/use-clipboard.svelte';
	import { toast } from 'svelte-sonner';

	let {
		entries,
		contents,
		base
	}: {
		entries: Entry[];
		/** Streamed in after the page renders (see readContents); only copying waits on it. */
		contents: Promise<Record<string, string>>;
		base: string;
	} = $props();

	async function copy(path: string) {
		// a menu item, not a button, so it shares CopyButton's clipboard logic rather than the component
		try {
			const text = (await contents)[path];
			// only text files are fetched for copying (see readContents)
			if (text === undefined) {
				toast.error('That file is binary, so there is no text to copy');
				return;
			}
			if ((await copyText(text)) === 'success') {
				toast.success('Copied contents');
				return;
			}
		} catch {
			// falls through to the error toast
		}
		toast.error('Could not copy the contents');
	}
</script>

{#if entries.length === 0}
	<div class="flex flex-col items-center justify-center gap-2 px-8 py-24 text-center">
		<p class="text-sm text-card-foreground">Nothing here</p>
		<p class="text-sm text-muted-foreground">This folder is empty.</p>
	</div>
{:else}
	<ul class="divide-y divide-border">
		{#each entries as entry (entry.path)}
			<li class="relative flex items-center justify-between gap-4 py-3.5">
				<a
					href="{base}/{entry.path}"
					{...listRow}
					class="flex min-w-0 flex-1 items-center gap-3 text-sm outline-none focus-visible:after:pointer-events-none focus-visible:after:absolute focus-visible:after:-inset-x-1.5 focus-visible:after:inset-y-1 focus-visible:after:rounded-md focus-visible:after:ring-2 focus-visible:after:ring-ring/50 focus-visible:after:content-['']"
				>
					<span class="absolute inset-0" aria-hidden="true"></span>

					{#if entry.kind === 'directory'}
						<RiFolder3Fill class="size-4 shrink-0 text-sky-500 dark:text-sky-300/80" />
					{:else}
						<FileIcon path={entry.path} />
					{/if}

					<span class="truncate text-card-foreground">{entry.name}</span>

					{#if entry.kind === 'directory'}
						<span class="shrink-0 text-xs text-muted-foreground">
							{entry.count}
							{entry.count === 1 ? 'file' : 'files'}
						</span>
					{/if}
				</a>

				<div class="relative flex shrink-0 items-center">
					<DropdownMenu.Root>
						<DropdownMenu.Trigger>
							{#snippet child({ props })}
								<Button
									{...props}
									variant="ghost"
									size="icon-sm"
									aria-label="Actions for {entry.name}"
								>
									<RiMoreFill class="text-muted-foreground" />
								</Button>
							{/snippet}
						</DropdownMenu.Trigger>

						<DropdownMenu.Content align="end">
							<DropdownMenu.Item>
								{#snippet child({ props })}
									<a {...props} href="{base}/{entry.path}">
										{#if entry.kind === 'directory'}
											<RiFolderOpenLine />
											Open
										{:else}
											<RiPencilLine />
											Edit
										{/if}
									</a>
								{/snippet}
							</DropdownMenu.Item>

							{#if entry.kind === 'file'}
								<DropdownMenu.Item onSelect={() => copy(entry.path)}>
									<RiFileCopyLine />
									Copy contents
								</DropdownMenu.Item>
							{/if}

							<DropdownMenu.Separator />

							<DropdownMenu.Item
								variant="destructive"
								onSelect={() =>
									confirmDelete({
										title:
											entry.kind === 'directory'
												? `Delete ${entry.name}/?`
												: `Delete ${entry.name}?`,
										description:
											entry.kind === 'directory'
												? `This deletes ${entry.count} ${entry.count === 1 ? 'file' : 'files'} and cannot be undone.`
												: 'This cannot be undone.',
										onConfirm: () => submitAction('?/deletePath', { path: entry.path })
									})}
							>
								<RiDeleteBinLine />
								Delete
							</DropdownMenu.Item>
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				</div>
			</li>
		{/each}
	</ul>
{/if}
