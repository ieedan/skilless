<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import { page } from '$app/state';
	import { APP_NAME } from '$lib/constants';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { UseClipboard } from '$lib/hooks/use-clipboard.svelte';
	import ClaudeLogo from './claude-logo.svelte';
	import MarkdownLogo from './markdown-logo.svelte';
	import OpenaiLogo from './openai-logo.svelte';

	/**
	 * Copy this page as markdown, or hand it to an assistant. The assistants get
	 * a link to the page's markdown rather than the text itself, which keeps the
	 * URL short and lets them read the current version.
	 */
	let { markdown, markdownHref }: { markdown: string; markdownHref: string } = $props();

	const clipboard = new UseClipboard({ delay: 1500 });

	const markdownUrl = $derived(new URL(markdownHref, page.url.origin).href);
	const prompt = $derived(
		`I'm reading the ${APP_NAME} documentation: ${markdownUrl}\nHelp me understand how to use it. Be ready to explain concepts, give examples, or help debug based on it.`
	);

	const assistants = $derived([
		{
			label: 'Open in ChatGPT',
			href: `https://chatgpt.com/?hints=search&q=${encodeURIComponent(prompt)}`,
			icon: OpenaiLogo
		},
		{
			label: 'Open in Claude',
			href: `https://claude.ai/new?q=${encodeURIComponent(prompt)}`,
			icon: ClaudeLogo
		}
	]);
</script>

<div class="inline-flex shrink-0 rounded-md shadow-xs">
	<Button
		variant="outline"
		size="sm"
		class="rounded-r-none border-r-0 shadow-none"
		onclick={() => clipboard.copy(markdown)}
	>
		{#if clipboard.copied}
			<CheckIcon />Copied
		{:else}
			<CopyIcon />Copy page
		{/if}
	</Button>

	<DropdownMenu.Root>
		<DropdownMenu.Trigger>
			{#snippet child({ props })}
				<Button
					{...props}
					variant="outline"
					size="icon-sm"
					class="rounded-l-none shadow-none"
					aria-label="More ways to use this page"
				>
					<ChevronDownIcon />
				</Button>
			{/snippet}
		</DropdownMenu.Trigger>

		<DropdownMenu.Content align="end" class="w-52">
			<DropdownMenu.Item>
				{#snippet child({ props })}
					<a {...props} href={markdownHref} data-sveltekit-reload>
						<MarkdownLogo class="size-4" />View as Markdown
					</a>
				{/snippet}
			</DropdownMenu.Item>
			{#each assistants as assistant (assistant.label)}
				<DropdownMenu.Item>
					{#snippet child({ props })}
						<a {...props} href={assistant.href} target="_blank" rel="noopener noreferrer">
							<assistant.icon class="size-4" />{assistant.label}
						</a>
					{/snippet}
				</DropdownMenu.Item>
			{/each}
		</DropdownMenu.Content>
	</DropdownMenu.Root>
</div>
