<script lang="ts">
	import { goto } from '$app/navigation';
	import { api } from '@skilless/platform';
	import { useConvexClient } from '@skilless/platform/client';
	import { toast } from 'svelte-sonner';
	import { LoadingButton } from '$lib/components/ui/loading-button';
	import RiAddLine from 'remixicon-svelte/icons/add-line';
	import RiCheckLine from 'remixicon-svelte/icons/check-line';

	/** Copies someone's skill into your library, as `skilless add @user/skill` would. */
	let {
		username,
		name,
		added = false,
		size = 'sm'
	}: { username: string; name: string; added?: boolean; size?: 'xs' | 'sm' } = $props();

	const client = useConvexClient();

	let adding = $state(false);
	/** Added here, since the page loaded; the page's own `added` covers before. */
	let done = $state(false);
	const isAdded = $derived(added || done);

	async function add(replace = false) {
		adding = true;
		try {
			const result = await client.action(api.imports.fromSkilless, { username, name, replace });

			if (result.status === 'missing') {
				toast.error(`${name} is no longer there to add`);
			} else if (result.status === 'own') {
				toast.info(`${result.name} is yours, so it is in your library already`);
			} else if (result.status === 'conflict') {
				toast.warning(`You already have a different ${result.name}`, {
					duration: 10_000,
					action: { label: 'Replace', onClick: () => add(true) }
				});
			} else {
				done = true;
				toast.success(
					result.status === 'added'
						? `Added ${result.name}`
						: `${result.name} is already in your library`,
					{
						action: {
							label: 'View',
							onClick: () => goto(`/my-skills/${encodeURIComponent(result.name)}`)
						}
					}
				);
			}
		} catch {
			toast.error(`Could not add ${name}`);
		} finally {
			adding = false;
		}
	}
</script>

{#if isAdded}
	<LoadingButton {size} variant="outline" disabled aria-label="{name} is in your library">
		<RiCheckLine />
		Added
	</LoadingButton>
{:else}
	<LoadingButton
		{size}
		variant="outline"
		loading={adding}
		onclick={() => add()}
		aria-label="Add {name} to your library"
	>
		<RiAddLine />
		Add
	</LoadingButton>
{/if}
