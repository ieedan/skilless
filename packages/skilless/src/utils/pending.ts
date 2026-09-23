import type { ApiClient } from '@/utils/api';
import * as fsu from '@/utils/fs';
import { PENDING_FILE } from '@/utils/paths';
import { localSkillNames } from '@/utils/skill';
import type { SkillSource } from '@/utils/types';

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
 * Sends everything queued to the server. Progress is saved after each step, so
 * losing the connection halfway leaves the rest queued rather than lost.
 *
 * A change about a skill the server does not have yet — one created offline —
 * stays queued until the `sync` that pushes it. Once the skill is gone from
 * this machine too, there is nothing left for it to wait on, so it is dropped.
 *
 * Returns how many changes were sent.
 */
export async function flushPending(api: ApiClient): Promise<number> {
	const pending = readPending();
	if (isEmpty(pending)) return 0;

	const known = new Set((await api.listSkills()).map((skill) => skill.name));
	const waiting = (name: string) => localSkillNames().includes(name);
	let sent = 0;

	for (const name of [...pending.deletes]) {
		if (known.has(name)) {
			await api.deleteSkill(name);
			known.delete(name);
			sent++;
		}

		pending.deletes = pending.deletes.filter((n) => n !== name);
		writePending(pending);
	}

	for (const [name, value] of Object.entries(pending.globals)) {
		if (!known.has(name)) {
			if (waiting(name)) continue;
		} else {
			await api.setGlobal(name, value);
			sent++;
		}

		delete pending.globals[name];
		writePending(pending);
	}

	for (const [name, source] of Object.entries(pending.sources)) {
		if (!known.has(name)) {
			if (waiting(name)) continue;
		} else {
			await api.setSource(name, source);
			sent++;
		}

		delete pending.sources[name];
		writePending(pending);
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

		entry.add = entry.add.filter((name) => unknown.has(name) && waiting(name));
		entry.remove = [];

		if (entry.add.length === 0) delete pending.projects[key];
		writePending(pending);
	}

	return sent;
}
