<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import Logo from '../logo.svelte';

	let { signedIn = false }: { signedIn?: boolean } = $props();
</script>

<header class="flex items-center justify-between px-6 py-7 md:px-30">
	<a href="/" class="flex py-1">
		<Logo class="h-4" />
	</a>

	<nav class="flex items-center gap-3">
		{#if signedIn}
			<Button href="/skills">Dashboard</Button>
		{:else}
			<Button href="/login">Sign Up</Button>
			<Button href="/login" variant="outline">Login</Button>
		{/if}
	</nav>
</header>
