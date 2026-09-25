<script lang="ts" generics="Skill extends { _id: string; name: string; description?: string }">
	import { DropdownMenu as DropdownMenuPrimitive } from 'bits-ui';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import RiCheckLine from 'remixicon-svelte/icons/check-line';
	import RiCodeSSlashLine from 'remixicon-svelte/icons/code-s-slash-line';
	import RiGlobalLine from 'remixicon-svelte/icons/global-line';

	let {
		skills,
		isGlobal,
		isBound,
		onToggle
	}: {
		skills: Skill[];
		/** A global skill is in every project already, so it shows as included and locked. */
		isGlobal: (skill: Skill) => boolean;
		isBound: (skill: Skill) => boolean;
		onToggle: (skill: Skill, bound: boolean) => void;
	} = $props();

	let query = $state('');
	let input = $state<HTMLInputElement | null>(null);
	let content = $state<HTMLElement | null>(null);

	const needle = $derived(query.trim().toLowerCase());

	/** Globals last: they cannot be toggled here, so they should not sit between the ones that can. */
	const filtered = $derived.by(() => {
		const list = needle
			? skills.filter(
					(skill) =>
						skill.name.toLowerCase().includes(needle) ||
						skill.description?.toLowerCase().includes(needle)
				)
			: skills;
		return [...list.filter((s) => !isGlobal(s)), ...list.filter((s) => isGlobal(s))];
	});

	/** See ProjectSubmenu: keep keys in the field, except Escape and ArrowDown. */
	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') return;

		event.stopPropagation();

		if (event.key === 'ArrowDown') {
			event.preventDefault();
			content
				?.querySelector<HTMLElement>('[role="menuitemcheckbox"]:not([data-disabled])')
				?.focus();
		}
	}

	const itemClass =
		'group/item flex cursor-default items-start gap-2.5 rounded-md px-2 py-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none';
</script>

{#snippet box(checked: boolean, muted = false)}
	<span
		class="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors {checked
			? muted
				? 'border-input bg-muted text-muted-foreground'
				: 'border-primary bg-primary text-primary-foreground'
			: 'border-input opacity-0 group-focus/item:opacity-100'}"
	>
		{#if checked}
			<RiCheckLine class="size-3" aria-hidden="true" />
		{/if}
	</span>
{/snippet}

<DropdownMenu.Sub onOpenChange={(open) => !open && (query = '')}>
	<DropdownMenu.SubTrigger>
		<RiCodeSSlashLine />
		Skills
	</DropdownMenu.SubTrigger>
	<DropdownMenu.SubContent
		bind:ref={content}
		side="left"
		sideOffset={4}
		class="flex w-80 flex-col p-0"
		onOpenAutoFocus={(event) => {
			event.preventDefault();
			input?.focus();
		}}
	>
		<input
			bind:this={input}
			bind:value={query}
			{onkeydown}
			placeholder="Filter…"
			aria-label="Filter skills"
			autocomplete="off"
			spellcheck="false"
			class="h-9 w-full shrink-0 border-b border-border bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground"
		/>

		<div class="max-h-80 min-h-0 overflow-y-auto p-1">
			{#each filtered as skill (skill._id)}
				{@const global = isGlobal(skill)}
				<!-- stays open so several skills can be toggled in one go -->
				<DropdownMenuPrimitive.CheckboxItem
					closeOnSelect={false}
					disabled={global}
					bind:checked={() => global || isBound(skill), (bound) => onToggle(skill, bound)}
					class={itemClass}
				>
					{#snippet children({ checked })}
						{@render box(checked, global)}

						<span class="flex min-w-0 flex-col gap-0.5 {global ? 'opacity-60' : ''}">
							<span class="flex min-w-0 items-center gap-1.5">
								<span class="truncate font-mono text-[13px] font-semibold">{skill.name}</span>
								{#if global}
									<RiGlobalLine
										class="size-3.5 shrink-0 text-muted-foreground"
										aria-label="Global"
									/>
								{/if}
							</span>
							<span class="line-clamp-1 text-xs text-muted-foreground">
								{skill.description || 'No description'}
							</span>
						</span>
					{/snippet}
				</DropdownMenuPrimitive.CheckboxItem>
			{:else}
				<p class="px-2 py-1.5 text-xs text-muted-foreground">
					{skills.length === 0 ? 'No skills yet.' : 'No skills match.'}
				</p>
			{/each}
		</div>
	</DropdownMenu.SubContent>
</DropdownMenu.Sub>
