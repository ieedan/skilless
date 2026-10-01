import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '@/utils/api';
import type { RemoteSkill, SkillFile } from '@/utils/types';

process.env.SKILLESS_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'skilless-background-'));

const { countRemoteChanges, pushChanges, readStatus, runBackground } =
	await import('@/utils/background');
const { readBindings, readLibrary } = await import('@/utils/library');
const { flushPending, queueBind, readPending } = await import('@/utils/pending');
const { hashFiles, writeSkill } = await import('@/utils/skill');
const { readState, writeState } = await import('@/utils/state');
const { SKILLESS_DIR } = await import('@/utils/paths');

const files = (contents: string): SkillFile[] => [{ path: 'SKILL.md', contents }];

/** A server holding whole skills, with the binding rules of the real one. */
function fakeApi(initial: Record<string, string> = {}, bound: Record<string, string[]> = {}) {
	const skills = new Map<string, RemoteSkill & { files: SkillFile[] }>();
	const put = (name: string, contents: string) => {
		const skill = {
			name,
			files: files(contents),
			contentHash: hashFiles(files(contents)),
			editedAt: 1,
			updatedAt: 1,
			global: false,
			source: null
		};
		skills.set(name, skill);
		return skill;
	};
	for (const [name, contents] of Object.entries(initial)) put(name, contents);

	const strip = ({ files: _, ...skill }: RemoteSkill & { files: SkillFile[] }) => skill;

	const api = {
		listSkills: vi.fn(async () => [...skills.values()].map(strip)),
		putSkill: vi.fn(async (name: string, f: SkillFile[]) => strip(put(name, f[0]!.contents))),
		deleteSkill: vi.fn(async (name: string) => void skills.delete(name)),
		setGlobal: vi.fn(async (name: string, value: boolean) => {
			skills.get(name)!.global = value;
		}),
		setSource: vi.fn(async () => {}),
		getBindings: vi.fn(async (key: string) =>
			[...skills.values()].filter((s) => s.global || (bound[key] ?? []).includes(s.name))
		),
		setBindings: vi.fn(async (key: string, next: string[]) => {
			bound[key] = next.filter((name) => skills.has(name));
			return { bound: bound[key], unknown: next.filter((name) => !skills.has(name)) };
		})
	};

	return { api: api as unknown as ApiClient & typeof api, skills, bound, put };
}

/** A skill on this machine and the server, recorded as synced. */
function synced(name: string, contents: string) {
	writeSkill(name, files(contents));
	const state = readState();
	state.skills[name] = { contentHash: hashFiles(files(contents)), editedAt: 1, syncedAt: 1 };
	writeState(state);
}

beforeEach(() => {
	fs.rmSync(SKILLESS_DIR, { recursive: true, force: true });
});

describe('pushChanges', () => {
	it('pushes a skill made here, then the binding that was waiting on it', async () => {
		const { api, bound } = fakeApi();

		writeSkill('new', files('# new'));
		queueBind('p', ['new']);

		await pushChanges(api);

		expect(api.putSkill).toHaveBeenCalledWith('new', files('# new'), expect.any(Number));
		expect(bound.p).toEqual(['new']);
		expect(readState().skills.new?.contentHash).toBe(hashFiles(files('# new')));
		expect(readPending().projects).toEqual({});

		// with the queue empty, the cache is what still knows it is in the project
		expect(await readBindings(null, 'p')).toEqual(['new']);
		expect((await readLibrary(null)).entries.find((e) => e.name === 'new')?.remote).not.toBeNull();
	});

	it('pushes an edit, but leaves a skill changed on both sides for sync', async () => {
		const { api, put } = fakeApi({ edited: '# v1', both: '# v1' });
		synced('edited', '# v1');
		synced('both', '# v1');

		writeSkill('edited', files('# v2'));
		writeSkill('both', files('# mine'));
		put('both', '# theirs');

		const { conflicts } = await pushChanges(api);

		expect(api.putSkill).toHaveBeenCalledTimes(1);
		expect(api.putSkill).toHaveBeenCalledWith('edited', files('# v2'), expect.any(Number));
		expect(conflicts).toEqual(['both']);
	});
});

describe('flushPending', () => {
	it('keeps a change queued while it was sending', async () => {
		const { api } = fakeApi({ a: '# a', b: '# b' });
		const setBindings = api.setBindings.getMockImplementation()!;
		api.setBindings.mockImplementationOnce(async (key, next) => {
			// another command, mid-flush
			queueBind('p', ['b']);
			return setBindings(key, next);
		});

		queueBind('p', ['a']);
		await flushPending(api);

		expect(readPending().projects.p).toEqual({ add: ['b'], remove: [] });
	});
});

describe('countRemoteChanges', () => {
	it('counts what sync would bring down, but not what is queued to go up', async () => {
		const { api, put, bound } = fakeApi({ a: '# a' });
		synced('a', '# a');
		await pushChanges(api);
		await flushPending(api);
		expect(await countRemoteChanges(api, 'p')).toBe(0);

		// made elsewhere: a new skill, and an edit
		put('b', '# b');
		put('a', '# a2');
		expect(await countRemoteChanges(api, null)).toBe(2);

		// queued here and not sent yet, so not a change from elsewhere
		queueBind('p', ['a']);
		bound.p = [];
		expect(await countRemoteChanges(api, 'p')).toBe(2);
	});

	it('counts a skill added to the project elsewhere', async () => {
		const { api, bound } = fakeApi({ a: '# a' });
		synced('a', '# a');
		queueBind('p', []);
		await pushChanges(api);

		// the cache only knows a project once something here has asked about it
		const { cacheProject } = await import('@/utils/cache');
		cacheProject('p', []);

		bound.p = ['a'];
		expect(await countRemoteChanges(api, 'p')).toBe(1);
	});
});

describe('runBackground', () => {
	it('records a failed push for the next command to mention', async () => {
		const { api } = fakeApi();
		api.listSkills.mockRejectedValueOnce(new Error('boom'));

		await runBackground(api, { push: true, check: false, key: null });

		expect(readStatus().push?.error).toBe('boom');
		expect(fs.existsSync(path.join(SKILLESS_DIR, 'background.lock'))).toBe(false);
	});

	it('leaves a push asked for while another runs to that one', async () => {
		const { api } = fakeApi();
		fs.mkdirSync(SKILLESS_DIR, { recursive: true });
		fs.writeFileSync(path.join(SKILLESS_DIR, 'background.lock'), '1');

		await runBackground(api, { push: true, check: false, key: null });

		expect(api.listSkills).not.toHaveBeenCalled();
		expect(fs.existsSync(path.join(SKILLESS_DIR, 'background.again'))).toBe(true);
	});

	it('records what the check found', async () => {
		const { api, put } = fakeApi();
		put('elsewhere', '# e');

		await runBackground(api, { push: false, check: true, key: null });

		expect(readStatus().remote).toMatchObject({ key: null, changes: 1 });
	});
});
