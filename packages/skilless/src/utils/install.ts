import type { ApiClient } from '@/utils/api';
import * as fsu from '@/utils/fs';
import { SKILLS_DIR } from '@/utils/paths';
import * as project from '@/utils/project';
import { findLocalSkill, writeSkill } from '@/utils/skill';
import { readState, writeState } from '@/utils/state';
import type { RemoteSkillWithFiles } from '@/utils/types';

/**
 * Cloud agents have no store to link against, so they get real files. Locally we
 * link, which is the whole point — one copy on disk however many projects use it.
 */
export function shouldCopy(explicit?: boolean): boolean {
	return explicit ?? !fsu.exists(SKILLS_DIR);
}

/**
 * Makes a project's bound skills visible to agents.
 *
 * In link mode any skill missing from the store is fetched first, but a skill
 * already there is left alone — pulling over it would silently discard an edit
 * you hadn't synced yet.
 */
export async function installSkills(
	root: string,
	skills: RemoteSkillWithFiles[],
	opts: { copy?: boolean; reconcile?: boolean } = {}
): Promise<project.MaterializeResult & { fetched: string[]; removed: string[] }> {
	const copy = shouldCopy(opts.copy);
	const fetched: string[] = [];

	if (!copy) {
		const state = readState();

		for (const skill of skills) {
			if (findLocalSkill(skill.name)) continue;

			writeSkill(skill.name, skill.files, skill.editedAt);
			state.skills[skill.name] = {
				contentHash: skill.contentHash,
				editedAt: skill.editedAt,
				syncedAt: Date.now()
			};
			fetched.push(skill.name);
		}

		writeState(state);
	}

	const result = project.materialize(root, skills, { copy });

	// anything we own that the server no longer resolves — unbound on the
	// website, or a skill that stopped being global
	const removed = opts.reconcile
		? project.unmaterialize(
				root,
				project.ownedSkills(root).filter((name) => !skills.some((skill) => skill.name === name))
			)
		: [];

	return { ...result, fetched, removed };
}

export async function boundNames(api: ApiClient, key: string): Promise<string[]> {
	return (await api.getBindings(key)).map((skill) => skill.name);
}
