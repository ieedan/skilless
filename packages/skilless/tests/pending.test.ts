import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '@/utils/api';
import type { RemoteSkill } from '@/utils/types';

process.env.SKILLESS_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'skilless-pending-'));

const { flushPending, queueBind, queueDelete, queueGlobal, queueUnbind, readPending } =
	await import('@/utils/pending');
const { writeSkill } = await import('@/utils/skill');
const { adoptSources, readSources, setSource } = await import('@/utils/sources');
const { SKILLESS_DIR } = await import('@/utils/paths');

function remote(name: string, global = false): RemoteSkill {
	return { name, contentHash: 'h', editedAt: 1, updatedAt: 1, global, source: null };
}

/** Just enough of the API for a flush, with the server's binding rules. */
function fakeApi(names: string[], bound: Record<string, string[]> = {}) {
	const skills = new Map(names.map((name) => [name, remote(name)]));

	const api = {
		listSkills: vi.fn(async () => [...skills.values()]),
		deleteSkill: vi.fn(async (name: string) => void skills.delete(name)),
		setGlobal: vi.fn(async (name: string, value: boolean) => {
			skills.get(name)!.global = value;
		}),
		setSource: vi.fn(async (name: string, source: RemoteSkill['source']) => {
			skills.get(name)!.source = source;
		}),
		getBindings: vi.fn(async (key: string) =>
			[...skills.values()]
				.filter((skill) => skill.global || (bound[key] ?? []).includes(skill.name))
				.map((skill) => ({ ...skill, files: [] }))
		),
		setBindings: vi.fn(async (key: string, next: string[]) => {
			bound[key] = next.filter((name) => skills.has(name));
			return { bound: bound[key], unknown: next.filter((name) => !skills.has(name)) };
		})
	};

	return { api: api as unknown as ApiClient & typeof api, bound };
}

beforeEach(() => {
	fs.rmSync(SKILLESS_DIR, { recursive: true, force: true });
});

describe('pending queue', () => {
	it('keeps bind and unbind of the same skill from both being queued', () => {
		queueBind('p', ['a']);
		queueUnbind('p', ['a']);
		expect(readPending().projects.p).toEqual({ add: [], remove: ['a'] });

		queueBind('p', ['a']);
		expect(readPending().projects.p).toEqual({ add: ['a'], remove: [] });
	});

	it('drops everything waiting on a skill once it is deleted', () => {
		queueBind('p', ['a', 'b']);
		queueGlobal(['a'], true);
		queueDelete(['a']);

		const pending = readPending();
		expect(pending.deletes).toEqual(['a']);
		expect(pending.globals).toEqual({});
		expect(pending.projects.p?.add).toEqual(['b']);
	});
});

describe('flushPending', () => {
	it('merges queued bindings into what the server has, instead of overwriting it', async () => {
		const { api, bound } = fakeApi(['a', 'b', 'c'], { p: ['a', 'b'] });

		queueBind('p', ['c']);
		queueUnbind('p', ['a']);

		expect(await flushPending(api)).toBe(2);
		expect(bound.p).toEqual(['b', 'c']);
		expect(fs.existsSync(path.join(SKILLESS_DIR, 'pending.json'))).toBe(false);
	});

	it('holds changes about a skill the server has not seen until it is pushed', async () => {
		writeSkill('new', [{ path: 'SKILL.md', contents: 'x' }]);
		const { api } = fakeApi([]);

		queueBind('p', ['new']);
		queueGlobal(['new'], true);

		await flushPending(api);

		expect(api.setGlobal).not.toHaveBeenCalled();
		expect(readPending().projects.p?.add).toEqual(['new']);
		expect(readPending().globals).toEqual({ new: true });
	});

	it('drops changes about a skill that exists nowhere', async () => {
		const { api } = fakeApi([]);

		queueBind('p', ['ghost']);
		queueGlobal(['ghost'], true);
		queueDelete(['gone']);

		expect(await flushPending(api)).toBe(0);
		expect(api.deleteSkill).not.toHaveBeenCalled();
		expect(fs.existsSync(path.join(SKILLESS_DIR, 'pending.json'))).toBe(false);
	});

	it('leaves the rest queued when the connection drops partway', async () => {
		const { api } = fakeApi(['a', 'b']);
		api.deleteSkill
			.mockImplementationOnce(async () => {})
			.mockRejectedValueOnce(new Error('offline'));

		queueDelete(['a', 'b']);

		await expect(flushPending(api)).rejects.toThrow('offline');
		expect(readPending().deletes).toEqual(['b']);
	});
});

describe('sources', () => {
	const from = { url: 'https://github.com/a/b.git', path: 'skills/a', hash: 'h1' };

	it('records a source here and queues it for the server', () => {
		setSource('a', from);

		expect(readSources().a).toEqual(from);
		expect(readPending().sources).toEqual({ a: from });
	});

	it('sends a queued source once the skill is on the server, and waits until then', async () => {
		writeSkill('a', [{ path: 'SKILL.md', contents: '# a' }]);
		setSource('a', from);

		const offline = fakeApi([]);
		await flushPending(offline.api);
		expect(offline.api.setSource).not.toHaveBeenCalled();
		expect(readPending().sources).toEqual({ a: from });

		const online = fakeApi(['a']);
		await flushPending(online.api);
		expect(online.api.setSource).toHaveBeenCalledWith('a', from);
		expect(readPending().sources).toEqual({});
	});

	it("takes the server's word, except where a change here has not reached it", () => {
		writeSkill('a', [{ path: 'SKILL.md', contents: '# a' }]);
		writeSkill('b', [{ path: 'SKILL.md', contents: '# b' }]);
		setSource('a', from);

		const elsewhere = { ...from, path: 'skills/b', hash: 'h2' };
		adoptSources([
			{ ...remote('a'), source: null },
			{ ...remote('b'), source: elsewhere }
		]);

		expect(readSources()).toEqual({ a: from, b: elsewhere });
	});

	it('forgets sources for skills that exist nowhere any more', () => {
		setSource('gone', from);
		const pending = readPending();
		pending.sources = {};
		fs.writeFileSync(path.join(SKILLESS_DIR, 'pending.json'), JSON.stringify(pending));

		adoptSources([]);

		expect(readSources()).toEqual({});
	});

	it('is dropped from the queue with the skill it describes', () => {
		setSource('a', from);
		queueDelete(['a']);

		expect(readPending().sources).toEqual({});
	});
});
