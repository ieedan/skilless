<script lang="ts">
	import { APP_NAME } from '$lib/constants';
	import { Button } from '$lib/components/ui/button';
	import Snippet from '../snippet.svelte';
	import Terminal from '../terminal.svelte';
	import Header from './header.svelte';

	let { signedIn = false }: { signedIn?: boolean } = $props();
</script>

<div class="flex min-h-dvh flex-col bg-background">
	<Header {signedIn} />

	<section class="flex flex-col items-center gap-9 px-6 py-24 text-center md:py-45">
		<div class="flex flex-col items-center gap-3">
			<h1 class="text-5xl font-semibold tracking-tight md:text-6xl">Skills Solved</h1>
			<p class="text-lg text-muted-foreground">Manage your skills like a pro.</p>
		</div>

		<Snippet command="npx {APP_NAME} init" />
	</section>

	<section class="flex justify-center px-6 py-20">
		<Terminal />
	</section>

	<section class="flex flex-col items-center gap-7 px-6 py-24 text-center md:py-45">
		<h2 class="text-4xl font-semibold tracking-tight">Go Skilless</h2>
		<Button href="/login" size="lg">Get Started</Button>
	</section>
</div>
