<script lang="ts">
	import type { Entry } from '$lib/files';
	import { submitAction } from '$lib/submit';
	import { confirmDelete } from '$lib/components/ui/confirm-delete-dialog';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Button } from '$lib/components/ui/button';
	import FileIcon from './file-icon.svelte';

	let { entries, base }: { entries: Entry[]; base: string } = $props();

	let copied = $state<string | null>(null);

	async function copy(path: string, contents: string) {
		try {
			await navigator.clipboard.writeText(contents);
			copied = path;
			setTimeout(() => (copied = null), 1500);
		} catch {
			// clipboard unavailable (insecure origin, denied permission) — the file
			// is one click away in the editor
		}
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
			<li class="relative flex items-center justify-between gap-4 px-6 py-3.5">
				<a
					href="{base}/{entry.path}"
					class="flex min-w-0 flex-1 items-center gap-3 font-mono text-sm"
				>
					<span class="absolute inset-0" aria-hidden="true"></span>

					{#if entry.kind === 'directory'}
						<i class="ri-folder-3-fill shrink-0 text-base leading-none text-sky-300/80"></i>
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

				<div class="relative flex shrink-0 items-center gap-2">
					{#if copied === entry.path}
						<span class="text-xs text-muted-foreground">Copied</span>
					{/if}

					<DropdownMenu.Root>
						<DropdownMenu.Trigger>
							{#snippet child({ props })}
								<Button
									{...props}
									variant="ghost"
									size="icon-sm"
									aria-label="Actions for {entry.name}"
								>
									<i class="ri-more-fill text-base leading-none text-muted-foreground"></i>
								</Button>
							{/snippet}
						</DropdownMenu.Trigger>

						<DropdownMenu.Content align="end">
							<DropdownMenu.Item>
								{#snippet child({ props })}
									<a {...props} href="{base}/{entry.path}">
										{#if entry.kind === 'directory'}
											<i class="ri-folder-open-line"></i>
											Open
										{:else}
											<i class="ri-pencil-line"></i>
											Edit
										{/if}
									</a>
								{/snippet}
							</DropdownMenu.Item>

							{#if entry.kind === 'file'}
								<DropdownMenu.Item onSelect={() => copy(entry.path, entry.contents)}>
									<i class="ri-file-copy-line"></i>
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
								<i class="ri-delete-bin-line"></i>
								Delete
							</DropdownMenu.Item>
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				</div>
			</li>
		{/each}
	</ul>
{/if}
