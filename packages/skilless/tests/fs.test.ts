import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { makeTemp } from '@/utils/fs';

const FS_MODULE = pathToFileURL(path.resolve(import.meta.dirname, '../src/utils/fs.ts')).href;

/**
 * Runs `body` in a fresh node process that has just made a temp directory,
 * and resolves with that directory once the process is gone.
 */
function inChild(body: string): Promise<{ dir: string; code: number | null }> {
	const script = `
		const { makeTemp } = await import(${JSON.stringify(FS_MODULE)});
		const { dir } = makeTemp('skilless-test-');
		console.log(dir);
		${body}
	`;

	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, ['--input-type=module', '-e', script], {
			stdio: ['ignore', 'pipe', 'inherit']
		});

		let out = '';
		child.stdout.on('data', (chunk: Buffer) => {
			out += chunk;
			if (out.includes('\n') && body.includes('READY')) child.kill('SIGINT');
		});
		child.on('error', reject);
		child.on('exit', (code) => resolve({ dir: out.split('\n')[0]!.trim(), code }));
	});
}

describe('makeTemp', () => {
	it('removes the directory on dispose, and stops catching signals', () => {
		const before = process.listenerCount('SIGINT');
		const { dir, dispose } = makeTemp('skilless-test-');

		expect(fs.existsSync(dir)).toBe(true);
		expect(process.listenerCount('SIGINT')).toBe(before + 1);

		dispose();

		expect(fs.existsSync(dir)).toBe(false);
		expect(process.listenerCount('SIGINT')).toBe(before);
	});

	it('is removed when the process exits before dispose', async () => {
		const { dir, code } = await inChild('process.exit(1);');

		expect(code).toBe(1);
		expect(dir).not.toBe('');
		expect(fs.existsSync(dir)).toBe(false);
	});

	it('is removed on ctrl-c', async () => {
		const { dir, code } = await inChild('/* READY */ setInterval(() => {}, 1000);');

		expect(code).toBe(130);
		expect(dir).not.toBe('');
		expect(fs.existsSync(dir)).toBe(false);
	});
});
