import * as fsu from '@/utils/fs';
import { SOURCES_FILE } from '@/utils/paths';
import { queueSource, readPending } from '@/utils/pending';
import { localSkillNames } from '@/utils/skill';
import type { RemoteSkill, SkillSource } from '@/utils/types';

type Sources = { version: 1; skills: Record<string, SkillSource> };

/**
 * Which repo each skill was copied from, as far as this machine knows. The
 * server keeps the same record in `skills.source`; this copy is what lets
 * `update` work signed out or offline.
 */
export function readSources(): Record<string, SkillSource> {
	return fsu.readJson<Partial<Sources>>(SOURCES_FILE, {}).skills ?? {};
}

function writeSources(skills: Record<string, SkillSource>): void {
	if (Object.keys(skills).length === 0) {
		fsu.remove(SOURCES_FILE);
		return;
	}

	fsu.writeJson(SOURCES_FILE, { version: 1, skills } satisfies Sources);
}

function same(a: SkillSource | null | undefined, b: SkillSource | null | undefined): boolean {
	return a?.url === b?.url && a?.ref === b?.ref && a?.path === b?.path && a?.hash === b?.hash;
}

/** Records where a skill came from — null forgets it — here and, queued, on the server. */
export function setSource(name: string, source: SkillSource | null): void {
	const sources = readSources();
	if (same(sources[name], source)) return;

	if (source) sources[name] = source;
	else delete sources[name];

	writeSources(sources);
	queueSource(name, source);
}

/** Forgets a skill's source on this machine only, for a skill that is gone. */
export function dropSources(names: string[]): void {
	const sources = readSources();
	for (const name of names) delete sources[name];
	writeSources(sources);
}

/**
 * Takes the server's word for every skill it listed, except where a change
 * made here is still waiting to reach it. Entries for skills that exist
 * nowhere any more are dropped.
 */
export function adoptSources(remote: RemoteSkill[]): void {
	const sources = readSources();
	const pending = readPending().sources;
	const listed = new Set(remote.map((skill) => skill.name));
	const local = new Set(localSkillNames());

	for (const skill of remote) {
		if (skill.name in pending) continue;

		if (skill.source) sources[skill.name] = skill.source;
		else delete sources[skill.name];
	}

	for (const name of Object.keys(sources)) {
		if (!listed.has(name) && !local.has(name) && !(name in pending)) delete sources[name];
	}

	writeSources(sources);
}
