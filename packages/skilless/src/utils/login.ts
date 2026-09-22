import crypto from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { getApiUrl, setToken } from '@/utils/auth';
import { openBrowser } from '@/utils/browser';
import { SkillessError } from '@/utils/errors';
import { log } from '@/utils/prompts';

const TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Loopback sign in: we listen on a random localhost port, the website mints a
 * token once you approve it, and posts it back here.
 *
 * Headless environments can't run this — they set SKILLESS_TOKEN instead, which
 * is why there is no device flow.
 */
export async function login(): Promise<void> {
	const state = crypto.randomBytes(16).toString('hex');
	const apiUrl = getApiUrl();
	const origin = new URL(apiUrl).origin;

	const cors: Record<string, string> = {
		'Access-Control-Allow-Origin': origin,
		'Access-Control-Allow-Methods': 'POST, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type',
		// Chrome's private network access check blocks a public page from
		// reaching localhost unless the server opts in here
		'Access-Control-Allow-Private-Network': 'true'
	};

	let settle: { resolve: (token: string) => void; reject: (reason: Error) => void };

	const pending = new Promise<string>((resolve, reject) => {
		settle = { resolve, reject };
	});

	const server = http.createServer((req, res) => {
		if (req.method === 'OPTIONS') {
			res.writeHead(204, cors);
			res.end();
			return;
		}

		if (req.method !== 'POST') {
			res.writeHead(405, cors);
			res.end();
			return;
		}

		let body = '';
		req.on('data', (chunk) => {
			body += chunk;
		});

		req.on('end', () => {
			let parsed: { token?: string; state?: string };

			try {
				parsed = JSON.parse(body);
			} catch {
				res.writeHead(400, cors);
				res.end();
				return;
			}

			if (parsed.state !== state || !parsed.token) {
				res.writeHead(400, cors);
				res.end();
				return;
			}

			res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ ok: true }));

			settle.resolve(parsed.token);
		});
	});

	const timer = setTimeout(() => {
		settle.reject(
			new SkillessError('Timed out waiting for sign in.', {
				suggestion:
					'Run `skilless auth` again, or paste a token with `skilless auth --token <token>`.'
			})
		);
	}, TIMEOUT_MS);

	try {
		await new Promise<void>((resolve, reject) => {
			server.once('error', reject);
			server.listen(0, '127.0.0.1', resolve);
		});

		const { port } = server.address() as AddressInfo;
		const url = `${apiUrl}/cli/auth?port=${port}&state=${state}`;

		log.info('Opening your browser to sign in…');
		log.dim(url);
		log.blank();

		openBrowser(url);

		setToken(await pending);
	} finally {
		clearTimeout(timer);
		server.close();
	}
}
