import fs from 'node:fs';
import { Command } from 'commander';
import path from 'pathe';
import { z } from 'zod';
import * as fsu from '@/utils/fs';
import * as git from '@/utils/git';
import { flush, readLibrary, refreshGlobals, refreshProject } from '@/utils/library';
import { AGENTS_SKILLS, CLAUDE_SKILLS, userAgentsSkills, userClaudeSkills } from '@/utils/paths';
import { queueBind, queueGlobal } from '@/utils/pending';
import * as project from '@/utils/project';
import { confirm, isInteractive, log, spin } from '@/utils/prompts';
import { Remote } from '@/utils/remote';
import { isValidName, readSkill, SKILL_FILE, writeSkill } from '@/utils/skill';
import { readState, writeState } from '@/utils/state';
import type { LocalSkill } from '@/utils/types';
import { VERSION } from '@/utils/version';
import {
	commonOptions,
	defaultCommandOptionsSchema,
	parseOptions,
	tryCommand,
	settleRefresh
} from './utils';

const schema = defaultCommandOptionsSchema.extend({
	yes: z.boolean(),
	user: z.boolean().optional()
});

type Scope = 'project' | 'user';

type Found = { name: string; dir: string; scope: Scope };

type Migration = {
	skill: LocalSkill;
	/** Every directory it was found in. All of them go once it is in the store. */
	dirs: string[];
	/** User-level wins: a skill you keep for every project becomes global. */
	scope: Scope;
	/** Already in your library with the same contents, so there is nothing to upload. */
	adopted: boolean;
};

/**
 * Real skill directories in `dir` — not symlinks, which are either ours already
 * or someone else's arrangement we have no business moving.
 */
function discover(dir: string, scope: Scope): Found[] {
	if (!fsu.exists(dir)) return [];

	return fs
		.readdirSync(dir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
		.map((entry) => ({ name: entry.name, dir: path.join(dir, entry.name), scope }))
		.filter((found) => fsu.exists(path.join(found.dir, SKILL_FILE)));
}

export const migrate = new Command('migrate')
	.description(
		"Move this project's skills into your library and link them back. Offers your user-level skills too, as globals linked back at the user level."
	)
	.option('--user', 'Migrate your user-level skills too, without asking.')
	.addOption(commonOptions.yes)
	.addOption(commonOptions.cwd)
	.action(async (raw) => {
		const options = parseOptions(schema, raw);
		log.intro(VERSION);

		await tryCommand(async () => {
			const remote = new Remote();
			const root = project.projectRoot(options.cwd);
			const key = git.projectKey(options.cwd);

			/* ------------------------------------------------------------ find */

			const inProject = key
				? [AGENTS_SKILLS, CLAUDE_SKILLS].flatMap((rel) =>
						discover(path.join(root, rel), 'project').filter((found) => {
							// committed skills belong to everyone who clones the repo;
							// deleting them here would delete them for the whole team
							const tracked = git.isTracked(root, path.relative(root, found.dir));
							if (tracked) {
								log.warn(
									`${found.name} is committed to this repo, so it was left alone. Remove it from git first to migrate it.`
								);
							}
							return !tracked;
						})
					)
				: [];

			const inUser = [
				...discover(userClaudeSkills(), 'user'),
				...discover(userAgentsSkills(), 'user')
			];

			if (!key) log.dim('No git remote here, so there are no project skills to migrate.');

			if (inProject.length === 0 && inUser.length === 0) {
				log.info('Nothing to migrate.');
				return;
			}

			/* ------------------------------------------------------------ plan */

			const current = await spin('Loading your library', async () => {
				await flush(remote);
				return readLibrary(remote);
			});
			const library = new Map(current.entries.map((e) => [e.name, e]));

			const plan = async (found: Found[]): Promise<Migration[]> => {
				const byName = new Map<string, Found[]>();
				for (const f of found) byName.set(f.name, [...(byName.get(f.name) ?? []), f]);

				const migrations: Migration[] = [];

				for (const [name, copies] of [...byName].sort(([a], [b]) => a.localeCompare(b))) {
					if (!isValidName(name)) {
						log.warn(`Skipped ${name}: not a valid skill name.`);
						continue;
					}

					let read: LocalSkill[];
					try {
						read = copies.map((copy) => readSkill(copy.dir, name));
					} catch (e) {
						log.warn(`Skipped ${name}: ${e instanceof Error ? e.message : 'unreadable'}.`);
						continue;
					}

					const skill = read[0];
					if (!skill) continue;

					if (read.some((other) => other.contentHash !== skill.contentHash)) {
						log.warn(
							`Skipped ${name}: found more than one version (${copies.map((c) => c.dir).join(', ')}).`
						);
						continue;
					}

					const existing = library.get(name);
					const theirs = existing?.local?.contentHash ?? existing?.remote?.contentHash;

					if (theirs && theirs !== skill.contentHash) {
						log.warn(
							`Skipped ${name}: a different ${name} is already in your library. Rename one to migrate it.`
						);
						continue;
					}

					migrations.push({
						skill,
						dirs: copies.map((copy) => copy.dir),
						scope: copies.some((copy) => copy.scope === 'user') ? 'user' : 'project',
						adopted: theirs !== undefined
					});
				}

				return migrations;
			};

			let migrations = await plan(inProject);

			if (migrations.length > 0) {
				log.info(`Project skills in ${key}: ${migrations.map((m) => m.skill.name).join(', ')}`);
				const ok =
					options.yes ||
					(await confirm(
						`Move ${migrations.length} skill(s) into skilless and link them here?`,
						true
					));
				if (!ok) migrations = [];
			}

			if (inUser.length > 0) {
				const names = [...new Set(inUser.map((found) => found.name))].sort();
				log.info(`User-level skills: ${names.join(', ')}`);

				// never on --yes alone: these reach every project on the machine
				const wantsUser =
					options.user ||
					(!options.yes &&
						isInteractive &&
						(await confirm(
							'Would you also like to migrate your user-level skills? They become global and are linked back into ~/.agents/skills, so every project still gets them.',
							false
						)));

				if (wantsUser) {
					const taken = new Set(migrations.map((m) => m.skill.name));
					// a skill found at both levels is planned once, from both places
					const both = await plan([
						...inUser,
						...inProject.filter((found) => inUser.some((u) => u.name === found.name))
					]);
					migrations = [
						...migrations.filter((m) => !both.some((b) => b.skill.name === m.skill.name)),
						...both
					];
					for (const name of taken) {
						if (!migrations.some((m) => m.skill.name === name)) {
							log.warn(`Skipped ${name}: its project and user-level copies differ.`);
						}
					}
				}
			}

			if (migrations.length === 0) {
				log.info('Nothing was migrated.');
				return;
			}

			/* ---------------------------------------------------------- migrate */

			const state = readState();

			for (const { skill, adopted } of migrations) {
				writeSkill(skill.name, skill.files, skill.editedAt);
				if (adopted) continue;

				const pushed = await spin(`Saving ${skill.name} to your library`, () =>
					remote.try((api) => api.putSkill(skill.name, skill.files, skill.editedAt))
				);

				if (pushed) {
					state.skills[skill.name] = {
						contentHash: skill.contentHash,
						editedAt: skill.editedAt,
						syncedAt: Date.now()
					};
				} else {
					// unknown to state.json, so the next sync pushes it
					delete state.skills[skill.name];
				}
			}

			writeState(state);

			// only once every skill is safely in the store
			for (const { dirs } of migrations) for (const dir of dirs) fsu.remove(dir);

			const globals = migrations.filter((m) => m.scope === 'user').map((m) => m.skill.name);
			const bound = migrations.filter((m) => m.scope === 'project').map((m) => m.skill.name);

			if (globals.length > 0) queueGlobal(globals, true);
			if (key && bound.length > 0) queueBind(key, bound);
			await spin('Saving to skilless.dev', () => flush(remote));

			for (const name of bound) log.step(`Migrated ${name} into your library and this project.`);
			for (const name of globals) log.step(`Migrated ${name} into your library as a global skill.`);

			// the originals are gone, so link everything back — a global lands
			// at the user level, once, right where it was before
			if (key) {
				await settleRefresh(
					await spin('Updating this project', () => refreshProject(remote, root, key)),
					{ yes: options.yes }
				);
			} else if (globals.length > 0) {
				await settleRefresh(
					await spin('Linking your global skills', () => refreshGlobals(remote)),
					{ yes: options.yes }
				);
			}

			remote.report();
		});
	});
