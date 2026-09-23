import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let home: string;

const synced = { a: { contentHash: 'h1', editedAt: 1000, syncedAt: 1000 } };

beforeEach(() => {
	home = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'skilless-'));

	vi.resetModules();
	vi.stubEnv('SKILLESS_HOME', home);
	vi.stubEnv('SKILLESS_API_URL', 'https://one.example');
	vi.stubEnv('SKILLESS_TOKEN', 'token-one');
});

afterEach(() => {
	vi.unstubAllEnvs();
	fs.rmSync(home, { recursive: true, force: true });
});

describe('readState', () => {
	it('reads back what was written against the same library', async () => {
		const { readState, writeState } = await import('@/utils/state');

		writeState({ version: 1, skills: synced });

		expect(readState().skills).toEqual(synced);
	});

	it('is empty against another server', async () => {
		const { readState, writeState } = await import('@/utils/state');

		writeState({ version: 1, skills: synced });
		vi.stubEnv('SKILLESS_API_URL', 'https://two.example');

		expect(readState().skills).toEqual({});
	});

	it('is empty after signing in with another token', async () => {
		const { readState, writeState } = await import('@/utils/state');

		writeState({ version: 1, skills: synced });
		vi.stubEnv('SKILLESS_TOKEN', 'token-two');

		expect(readState().skills).toEqual({});
	});

	it('is empty when it predates recording the library', async () => {
		fs.writeFileSync(path.join(home, 'state.json'), JSON.stringify({ version: 1, skills: synced }));
		const { readState } = await import('@/utils/state');

		expect(readState().skills).toEqual({});
	});

	it('never writes the token itself', async () => {
		const { writeState } = await import('@/utils/state');

		writeState({ version: 1, skills: synced });

		expect(fs.readFileSync(path.join(home, 'state.json'), 'utf8')).not.toContain('token-one');
	});
});
