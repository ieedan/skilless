import { spawn } from 'node:child_process';

/**
 * The command that opens a URL here. On Windows, `start` goes through cmd.exe,
 * which cuts a URL off at its first `&` — rundll32 takes it as a plain argument.
 */
function opener(url: string): [string, string[]] {
	switch (process.platform) {
		case 'darwin':
			return ['open', [url]];
		case 'win32':
			return ['rundll32', ['url.dll,FileProtocolHandler', url]];
		default:
			return ['xdg-open', [url]];
	}
}

/** Best effort — the caller always prints the URL too, so a failure is survivable. */
export function openBrowser(url: string): void {
	const [command, args] = opener(url);

	try {
		const child = spawn(command, args, { stdio: 'ignore', detached: true, windowsHide: true });
		// a missing xdg-open (a bare Linux server, say) is reported here, not thrown
		child.on('error', () => {});
		child.unref();
	} catch {
		// the URL is printed regardless
	}
}
