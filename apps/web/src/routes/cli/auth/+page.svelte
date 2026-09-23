<script lang="ts">
	import { enhance } from '$app/forms';
	import { APP_NAME } from '$lib/constants';

	let { data, form } = $props();

	let status = $state<'idle' | 'sending' | 'done' | 'failed'>('idle');

	/**
	 * Hands the token to the waiting CLI. If the browser blocks the localhost
	 * request we fall back to showing it, since `skilless auth --token` exists
	 * precisely for that case.
	 */
	async function deliver(token: string) {
		if (!data.port || !data.state) {
			status = 'failed';
			return;
		}

		status = 'sending';

		try {
			const response = await fetch(`http://127.0.0.1:${data.port}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ token, state: data.state })
			});

			status = response.ok ? 'done' : 'failed';
		} catch {
			status = 'failed';
		}
	}

	$effect(() => {
		if (form?.token && status === 'idle') deliver(form.token);
	});
</script>

<svelte:head><title>Authorize CLI · {APP_NAME}</title></svelte:head>

<main class="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
	{#if !data.port || !data.state}
		<h1 class="text-lg font-semibold">This link is incomplete.</h1>
		<p class="max-w-sm text-sm text-neutral-400">
			Run <code class="text-neutral-200">skilless auth</code> again to get a fresh one.
		</p>
	{:else if status === 'done'}
		<h1 class="text-lg font-semibold">You're signed in.</h1>
		<p class="text-sm text-neutral-400">You can close this tab and go back to your terminal.</p>
	{:else if status === 'failed' && form?.token}
		<h1 class="text-lg font-semibold">Almost there. Paste this in your terminal.</h1>
		<p class="max-w-md text-sm text-neutral-400">
			Your browser wouldn't let this page reach the CLI, so copy the token instead:
		</p>
		<pre
			class="w-full max-w-md overflow-x-auto rounded-md border border-neutral-800 bg-neutral-900 p-3 text-left text-xs">skilless auth --token {form.token}</pre>
	{:else if status === 'sending'}
		<p class="text-sm text-neutral-400">Sending the token to your terminal…</p>
	{:else}
		<h1 class="text-lg font-semibold">Authorize the skilless CLI?</h1>
		<p class="max-w-sm text-sm text-neutral-400">
			This creates a token on this machine so the CLI can read and write your skills.
		</p>

		<form method="POST" action="?/authorize" use:enhance>
			<button
				class="rounded-md bg-neutral-100 px-5 py-2.5 text-sm font-medium text-neutral-900 transition hover:bg-white"
			>
				Authorize
			</button>
		</form>
	{/if}
</main>
