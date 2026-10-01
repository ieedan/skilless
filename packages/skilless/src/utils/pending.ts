import type { ApiClient } from '@/utils/api';
import { type Cache, updateCache } from '@/utils/cache';
import * as fsu from '@/utils/fs';
import { PENDING_FILE } from '@/utils/paths';
import { localSkillNames } from '@/utils/skill';
import type { RemoteSkill, SkillSource } from '@/utils/types';

export type ProjectChange = { add: string[]; remove: string[] };

export type Pending = {
	version: 1;
	projects: Record<string, ProjectChange>;
	globals: Record<string, boolean>;
	/** Null forgets a skill's source. */
	sources: Record<string, SkillSource | null>;
	deletes: string[];
};

/**
 * Changes made on this machine that the server has not heard about yet.
 *
 * Every command that changes bindings, globals, sources or deletions writes here first
 * and then flushes, so the offline path and the online one are the same path —
 * online, the queue just empties straight away. Skill contents need no queue:
 * `state.json` already tells `sync` what is new here.
 *
 * Bindings are stored as a delta rather than a list, so an edit made on the
 * website in the meantime survives the flush.
 */
export function readPending(): Pending {
	const pending = fsu.readJson<Partial<Pending>>(PENDING_FILE, {});
	return {
		version: 1,
		projects: pending.projects ?? {},
		globals: pending.globals ?? {},
		sources: pending.sources ?? {},
		deletes: pending.deletes ?? []
	};
}

export function writePending(pending: Pending): void {
	if (isEmpty(pending)) {
		fsu.remove(PENDING_FILE);
		return;
	}

	fsu.writeJson(PENDING_FILE, pending);
}

export function isEmpty(pending: Pending): boolean {
	return (
		Object.keys(pending.projects).length === 0 &&
		Object.keys(pending.globals).length === 0 &&
		Object.keys(pending.sources).length === 0 &&
		pending.deletes.length === 0
	);
}

function change(pending: Pending, key: string): ProjectChange {
	pending.projects[key] ??= { add: [], remove: [] };
	return pending.projects[key];
}

export function queueBind(key: string, names: string[]): void {
	const pending = readPending();
	const entry = change(pending, key);

	entry.add = [...new Set([...entry.add, ...names])];
	entry.remove = entry.remove.filter((name) => !names.includes(name));

	writePending(pending);
}

export function queueUnbind(key: string, names: string[]): void {
	const pending = readPending();
	const entry = change(pending, key);

	entry.remove = [...new Set([...entry.remove, ...names])];
	entry.add = entry.add.filter((name) => !names.includes(name));

	writePending(pending);
}

export function queueGlobal(names: string[], value: boolean): void {
	const pending = readPending();
	for (const name of names) pending.globals[name] = value;
	writePending(pending);
}

export function queueSource(name: string, source: SkillSource | null): void {
	const pending = readPending();
	pending.sources[name] = source;
	writePending(pending);
}

/** A deleted skill takes every other change waiting on it down with it. */
export function queueDelete(names: string[]): void {
	const pending = readPending();

	pending.deletes = [...new Set([...pending.deletes, ...names])];

	for (const name of names) {
		delete pending.globals[name];
		delete pending.sources[name];
	}

	for (const entry of Object.values(pending.projects)) {
		entry.add = entry.add.filter((name) => !names.includes(name));
	}

	writePending(pending);
}

/**
 * Reads the queue fresh, applies `change`, and writes it back. Another
 * process — a background push, or a command run meanwhile — may have queued
 * something since this one last read it, and that must not be written over.
 */
function settle(change: (pending: Pending) => void): void {
	const pending = readPending();
	change(pending);
	writePending(pending);
}

/**
 * Sends everything queued to the server. Progress is saved after each step, so
 * losing the connection halfway leaves the rest queued rather than lost.
 *
 * A change about a skill the server does not have yet — one created offline —
 * stays queued until the push that sends it. Once the skill is gone from
 * this machine too, there is nothing left for it to wait on, so it is dropped.
 *
 * Each change the server accepts is written into the cache as well, since
 * that, plus the queue, is what every command reads without `--sync`.
 *
 * Pass `library` when the caller has just listed it, to save listing it again.
 *
 * Returns how many changes were sent.
 */
export async function flushPending(api: ApiClient, library?: RemoteSkill[]): Promise<number> {
	const pending = readPending();
	if (isEmpty(pending)) return 0;

	const known = new Set((library ?? (await api.listSkills())).map((skill) => skill.name));
	const waiting = (name: string) => localSkillNames().includes(name);
	const inLibrary = (cache: Cache, name: string) =>
		cache.library?.find((skill) => skill.name === name);
	let sent = 0;

	for (const name of pending.deletes) {
		if (known.has(name)) {
			await api.deleteSkill(name);
			known.delete(name);
			sent++;
		}

		updateCache((cache) => {
			cache.library = cache.library?.filter((skill) => skill.name !== name) ?? null;
		});
		settle((fresh) => {
			fresh.deletes = fresh.deletes.filter((n) => n !== name);
		});
	}

	for (const [name, value] of Object.entries(pending.globals)) {
		if (!known.has(name)) {
			if (waiting(name)) continue;
		} else {
			await api.setGlobal(name, value);
			updateCache((cache) => {
				const skill = inLibrary(cache, name);
				if (skill) skill.global = value;
			});
			sent++;
		}

		// changed again meanwhile, so that change is still to send
		settle((fresh) => {
			if (fresh.globals[name] === value) delete fresh.globals[name];
		});
	}

	for (const [name, source] of Object.entries(pending.sources)) {
		if (!known.has(name)) {
			if (waiting(name)) continue;
		} else {
			await api.setSource(name, source);
			updateCache((cache) => {
				const skill = inLibrary(cache, name);
				if (skill) skill.source = source;
			});
			sent++;
		}

		settle((fresh) => {
			if (JSON.stringify(fresh.sources[name]) === JSON.stringify(source))
				delete fresh.sources[name];
		});
	}

	for (const [key, entry] of Object.entries(pending.projects)) {
		const bound = (await api.getBindings(key))
			.filter((skill) => !skill.global)
			.map((skill) => skill.name);

		const next = [...new Set([...bound, ...entry.add])].filter(
			(name) => !entry.remove.includes(name)
		);

		const result = await api.setBindings(key, next);
		const unknown = new Set(result.unknown);

		sent += entry.add.filter((name) => !unknown.has(name)).length + entry.remove.length;

		updateCache((cache) => {
			cache.projects[key] = result.bound;
		});
		settle((fresh) => {
			const change = fresh.projects[key];
			if (!change) return;

			// only what was sent; anything queued since stays
			const keep = (name: string) => unknown.has(name) && waiting(name);
			change.add = change.add.filter((name) => !entry.add.includes(name) || keep(name));
			change.remove = change.remove.filter((name) => !entry.remove.includes(name));

			if (change.add.length === 0 && change.remove.length === 0) delete fresh.projects[key];
		});
	}

	return sent;
}
