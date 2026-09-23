import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '@/utils/api';
import type { State } from '@/utils/state';
import { applySync, planSync } from '@/utils/sync';
import type { LocalSkill, RemoteSkill } from '@/utils/types';

function local(name: string, hash: string, editedAt = 1000): LocalSkill {
	return { name, dir: `/tmp/${name}`, files: [], contentHash: hash, editedAt };
}

function remote(name: string, hash: string, editedAt = 1000): RemoteSkill {
	return { name, contentHash: hash, editedAt, updatedAt: editedAt, global: false, source: null };
}

function state(entries: Record<string, string>): State {
	return {
		version: 1,
		skills: Object.fromEntries(
			Object.entries(entries).map(([name, contentHash]) => [
				name,
				{ contentHash, editedAt: 1000, syncedAt: 1000 }
			])
		)
	};
}

const plan = (l: LocalSkill[], r: RemoteSkill[], s: State, force?: 'push' | 'pull') =>
	planSync(
		new Map(l.map((skill) => [skill.name, skill])),
		new Map(r.map((skill) => [skill.name, skill])),
		s,
		force
	);

describe('planSync', () => {
	it('does nothing when both sides match', () => {
		const actions = plan([local('a', 'h1')], [remote('a', 'h1')], state({ a: 'h1' }));
		expect(actions).toEqual([{ type: 'noop', name: 'a' }]);
	});

	it('pushes a local edit and pulls a remote one', () => {
		expect(plan([local('a', 'h2')], [remote('a', 'h1')], state({ a: 'h1' }))).toEqual([
			{ type: 'push', name: 'a' }
		]);

		expect(plan([local('a', 'h1')], [remote('a', 'h2')], state({ a: 'h1' }))).toEqual([
			{ type: 'pull', name: 'a' }
		]);
	});

	it('resolves a true conflict by the newer editedAt', () => {
		const older = state({ a: 'h0' });

		expect(plan([local('a', 'h1', 2000)], [remote('a', 'h2', 1000)], older)).toEqual([
			{ type: 'conflict-push', name: 'a' }
		]);

		expect(plan([local('a', 'h1', 1000)], [remote('a', 'h2', 2000)], older)).toEqual([
			{ type: 'conflict-pull', name: 'a' }
		]);
	});

	it('lets --push and --pull override the timestamp', () => {
		const older = state({ a: 'h0' });

		expect(plan([local('a', 'h1', 1)], [remote('a', 'h2', 9999)], older, 'push')).toEqual([
			{ type: 'conflict-push', name: 'a' }
		]);

		expect(plan([local('a', 'h1', 9999)], [remote('a', 'h2', 1)], older, 'pull')).toEqual([
			{ type: 'conflict-pull', name: 'a' }
		]);
	});

	it('propagates deletion only for skills it has seen before', () => {
		// deleted remotely — we synced it once, now it is gone over there
		expect(plan([local('a', 'h1')], [], state({ a: 'h1' }))).toEqual([
			{ type: 'delete-local', name: 'a' }
		]);

		// deleted locally — same reasoning, other direction
		expect(plan([], [remote('a', 'h1')], state({ a: 'h1' }))).toEqual([
			{ type: 'delete-remote', name: 'a' }
		]);
	});

	it('never deletes anything on a fresh machine', () => {
		// empty state: everything remote is simply new, nothing was "removed"
		const actions = plan([], [remote('a', 'h1'), remote('b', 'h2')], state({}));

		expect(actions).toEqual([
			{ type: 'pull', name: 'a' },
			{ type: 'pull', name: 'b' }
		]);
	});

	it('pushes a skill created here rather than treating it as a remote deletion', () => {
		expect(plan([local('new', 'h1')], [], state({}))).toEqual([{ type: 'push', name: 'new' }]);
	});

	it('treats two sides that both appeared with different content as a conflict', () => {
		const actions = plan([local('a', 'h1', 5)], [remote('a', 'h2', 9)], state({}));
		expect(actions).toEqual([{ type: 'conflict-pull', name: 'a' }]);
	});
});

describe('applySync', () => {
	it('sends skills concurrently and reports them in plan order', async () => {
		const names = Array.from({ length: 12 }, (_, i) => `s${String(i).padStart(2, '0')}`);
		let inFlight = 0;
		let peak = 0;

		const api = {
			// later skills answer sooner, so completion order is the reverse of plan order
			putSkill: vi.fn(async (name: string) => {
				peak = Math.max(peak, ++inFlight);
				await new Promise((resolve) => setTimeout(resolve, 50 - Number(name.slice(1)) * 3));
				inFlight--;
				return remote(name, `new-${name}`);
			}),
			deleteSkill: vi.fn(async () => {})
		} as unknown as ApiClient;

		const locals = new Map(names.map((name) => [name, local(name, `new-${name}`)]));
		const remotes = new Map([['gone', remote('gone', 'h')]]);
		const actions = [
			...names.map((name) => ({ type: 'push' as const, name })),
			{ type: 'delete-remote' as const, name: 'gone' }
		];
		const s = state({ gone: 'h' });

		const report = await applySync(api, actions, {
			local: locals,
			remote: remotes,
			state: s,
			yes: true
		});

		expect(peak).toBeGreaterThan(1);
		expect(peak).toBeLessThanOrEqual(8);
		expect(report.actions).toEqual(actions);
		expect([...remotes.keys()].sort()).toEqual(names);
		expect(remotes.get('s03')?.contentHash).toBe('new-s03');
		expect(Object.keys(s.skills).sort()).toEqual(names);
	});
});
