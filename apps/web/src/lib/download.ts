import { toast } from 'svelte-sonner';

/**
 * Downloads a zip with a toast that tracks it. A plain `<a download>` shows
 * nothing until the browser has the first byte, and building a zip of skills
 * takes a moment, so this fetches the file first and saves it once it lands.
 */
export function downloadZip(url: string, label: string) {
	const done = (async () => {
		const response = await fetch(url);
		if (!response.ok) throw new Error(`Download failed: ${response.status}`);

		// the server names the file; fall back to the label
		const name =
			/filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') ?? '')?.[1] ??
			`${label}.zip`;

		const href = URL.createObjectURL(await response.blob());
		const link = Object.assign(document.createElement('a'), { href, download: name });
		link.click();
		URL.revokeObjectURL(href);
	})();

	toast.promise(done, {
		loading: `Preparing ${label}…`,
		success: `Downloaded ${label}`,
		error: `Could not download ${label}`
	});
}
