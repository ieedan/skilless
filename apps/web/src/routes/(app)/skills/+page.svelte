<script lang="ts">
	import { enhance } from '$app/forms';
	import { APP_NAME } from '$lib/constants';
	import { submitAction } from '$lib/submit';
	import { NAME_RULES } from '$lib/skill';
	import PageActions from '$lib/components/app/page-actions.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { LoadingButton } from '$lib/components/ui/loading-button';
	import { Textarea } from '$lib/components/ui/textarea';
	import { confirmDelete } from '$lib/components/ui/confirm-delete-dialog';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Button } from '$lib/components/ui/button';
	import ReadingColumn from '$lib/components/app/reading-column.svelte';

	let { data, form } = $props();

	let open = $state(false);
	let creating = $state(false);

	/**
	 * A one-file skill has nothing to browse, so link straight at the file. The
	 * skill route redirects there anyway — this just saves the round trip, and
	 * `soleFile` rides along on a read the list already does.
	 */
	const href = (skill: (typeof data.skills)[number]) =>
		skill.soleFile
			? `/skills/${encodeURIComponent(skill.name)}/${skill.soleFile}`
			: `/skills/${encodeURIComponent(skill.name)}`;
</script>

<svelte:head><title>Skills · {APP_NAME}</title></svelte:head>

<PageActions>
	<Button size="sm" onclick={() => (open = true)}>
		<i class="ri-add-line"></i>
		Create
	</Button>
</PageActions>

<ReadingColumn>
	{#if data.skills.length === 0}
		<div class="flex flex-col items-center justify-center gap-2 px-8 py-24 text-center">
			<p class="text-sm text-card-foreground">No skills yet</p>
			<p class="text-sm text-muted-foreground">
				Run <code class="font-mono text-foreground">skilless create &lt;name&gt;</code> to make your first
				one.
			</p>
		</div>
	{:else}
		<ul class="divide-y divide-border">
			{#each data.skills as skill (skill._id)}
				<li class="group/row relative flex items-center justify-between gap-4 px-6 py-3.5">
					<a href={href(skill)} class="flex min-w-0 flex-col gap-1.5">
						<!-- stretched so the whole row is the hit target, without nesting the menu inside the link -->
						<span class="absolute inset-0" aria-hidden="true"></span>
						<span class="truncate font-mono text-sm font-semibold text-card-foreground">
							{skill.name}
						</span>
						<!--
							Two lines rather than one: descriptions come from SKILL.md
							frontmatter and are often a full sentence, which a single
							truncated line cuts to almost nothing at this width.
						-->
						<span class="line-clamp-2 text-[13px] text-muted-foreground">
							{skill.description ?? 'No description'}
						</span>
					</a>

					<div class="relative flex shrink-0 items-center gap-3">
						<DropdownMenu.Root>
							<DropdownMenu.Trigger>
								{#snippet child({ props })}
									<Button
										{...props}
										variant="ghost"
										size="icon-sm"
										aria-label="Actions for {skill.name}"
									>
										<i class="ri-more-fill text-base leading-none text-muted-foreground"></i>
									</Button>
								{/snippet}
							</DropdownMenu.Trigger>

							<DropdownMenu.Content align="end">
								<DropdownMenu.Item>
									{#snippet child({ props })}
										<a {...props} href={href(skill)}>
											<i class="ri-pencil-line"></i>
											Edit {skill.soleFile ?? 'SKILL.md'}
										</a>
									{/snippet}
								</DropdownMenu.Item>
								<DropdownMenu.Item>
									{#snippet child({ props })}
										<a {...props} href="/skills/{skill.name}">
											<i class="ri-folder-open-line"></i>
											Browse files
										</a>
									{/snippet}
								</DropdownMenu.Item>

								<DropdownMenu.Separator />

								<DropdownMenu.Item
									variant="destructive"
									onSelect={() =>
										confirmDelete({
											title: `Delete ${skill.name}?`,
											description:
												'This removes it from every project. It cannot be undone from here.',
											input: { confirmationText: skill.name },
											onConfirm: () => submitAction('?/remove', { name: skill.name })
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
</ReadingColumn>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-md">
		<form
			method="POST"
			action="?/create"
			use:enhance={() => {
				creating = true;
				return async ({ update }) => {
					// a success redirects into the editor; only failures come back here
					await update({ reset: false });
					creating = false;
				};
			}}
		>
			<Dialog.Header>
				<Dialog.Title>Create a skill</Dialog.Title>
				<Dialog.Description>
					We will start you off with a SKILL.md you can edit straight away.
				</Dialog.Description>
			</Dialog.Header>

			<div class="flex flex-col gap-5 py-6">
				<div class="flex flex-col gap-2">
					<Label for="skill-name">Name</Label>
					<Input
						id="skill-name"
						name="name"
						placeholder="resolve-comments"
						autocomplete="off"
						spellcheck="false"
						value={form?.name ?? ''}
					/>
					<p class="text-xs text-muted-foreground">{NAME_RULES}</p>
				</div>

				<div class="flex flex-col gap-2">
					<Label for="skill-description">Description</Label>
					<Textarea
						id="skill-description"
						name="description"
						rows={3}
						placeholder="What does this skill do, and when should an agent reach for it?"
						value={form?.description ?? ''}
					/>
				</div>

				{#if form?.message}
					<p class="text-[13px] text-destructive" role="alert">{form.message}</p>
				{/if}
			</div>

			<Dialog.Footer>
				<Button type="button" variant="ghost" onclick={() => (open = false)}>Cancel</Button>
				<LoadingButton type="submit" loading={creating}>Create</LoadingButton>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
