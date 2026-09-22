import { spawn } from 'node:child_process';

/** Best effort — the caller always prints the URL too, so a failure is survivable. */
export function openBrowser(url: string): void {
	const command =
		process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';

	try {
		const child = spawn(command, [url], {
			stdio: 'ignore',
			detached: true,
			shell: process.platform === 'win32'
		});
		child.unref();
	} catch {
		// the URL is printed regardless
	}
}
