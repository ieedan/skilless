import { Command } from 'commander';
import { z } from 'zod';
import { clearStatus } from '@/utils/background';
import { cacheLibrary } from '@/utils/cache';
import * as git from '@/utils/git';
import { installProject, linkGlobals } from '@/utils/install';
import { flushPending } from '@/utils/pending';
import { adoptSources } from '@/utils/sources';
import * as project from '@/utils/project';
import { log, spin } from '@/utils/prompts';
import { listLocalSkills } from '@/utils/skill';
import { readState, writeState } from '@/utils/state';
import { applySync, describe, planSync, type Side } from '@/utils/sync';
import type { LocalSkill, RemoteSkill } from '@/utils/types';
import { VERSION } from '@/utils/version';
import {
	commonOptions,
	defaultCommandOptionsSchema,
	parseOptions,
	requireApi,
	tryCommand,
	USER_SKILLS,
	settleRefresh
} from './utils';

const schema = defaultCommandOptionsSchema.extend({
	yes: z.boolean(),
	push: z.boolean().optional(),
	pull: z.boolean().optional()
});

export const sync = new Command('sync')
	.description(
		"Sync your library with skilless.dev, in both directions, and update this project's skills and your global ones."
	)
	.option('--push', 'On a conflict, keep the local copy.')
	.option('--pull', 'On a conflict, keep the remote copy.')
	.addOption(commonOptions.yes)
	.addOption(commonOptions.cwd)
	.action(async (raw) => {
		const options = parseOptions(schema, raw);
		log.intro(VERSION);

		await tryCommand(async () => {
			const api = requireApi();

			// deletions queued while offline go first, or the plan below would
			// read them as skills this machine has never seen and pull them back
			const [flushed, listed] = await spin('Checking skilless.dev', async () => {
				const before = await api.listSkills();
				const flushed = await flushPending(api, before);
				// only a flush that sent something can have changed the library
				return [flushed, flushed > 0 ? await api.listSkills() : before] as const;
			});

			const local = new Map<string, LocalSkill>(
				listLocalSkills().map((skill) => [skill.name, skill])
			);
			const remote = new Map<string, RemoteSkill>(listed.map((skill) => [skill.name, skill]));

			const state = readState();
			const force: Side | undefined = options.push ? 'push' : options.pull ? 'pull' : undefined;

			const actions = planSync(local, remote, state, force);
			const report = await spin('Syncing your library', () =>
				applySync(api, actions, { local, remote, state, yes: options.yes })
			);

			writeState(state);

			const changes = report.actions.map(describe).filter((line) => line !== null);
			for (const line of changes) log.step(line);

			// anything queued about a skill that only just got pushed can go now.
			// `remote` already reflects every push and delete, so the library only
			// needs listing again if the flush changed a global or a source
			const [sent, latest] = await spin('Syncing your library', async () => {
				const library = [...remote.values()];
				const late = await flushPending(api, library);
				return [flushed + late, late > 0 ? await api.listSkills() : library] as const;
			});
			if (sent > 0) log.step(`Sent ${sent} change(s) made while offline.`);

			cacheLibrary(latest);
			adoptSources(latest);
			// everything is sent and fetched, so nothing the background noticed still holds
			clearStatus();

			// inside a project, bring its links up to date too — the store is
			// current now, so this is what makes a website edit show up here.
			// Either way, globals are linked at the user level.
			const key = git.projectKey(options.cwd);
			const linked = await spin(
				key ? 'Updating this project' : 'Updating your global skills',
				async () => {
					if (!key) return { user: linkGlobals(latest.filter((s) => s.global).map((s) => s.name)) };

					const result = await installProject(api, project.projectRoot(options.cwd), key);
					return { ...result, project: result.project };
				}
			);

			const inProject = 'project' in linked ? linked.project : undefined;
			const { user } = linked;

			if (inProject) {
				for (const name of inProject.added) log.step(`Linked ${name} into this project.`);
				for (const name of inProject.removed)
					log.step(`Unlinked ${name}, which is no longer in this project.`);
				for (const name of inProject.pruned)
					log.step(`Unlinked ${name}, which is no longer in your library.`);
			}

			for (const name of user.added) log.step(`Linked ${name} into ${USER_SKILLS}.`);
			for (const name of user.removed)
				log.step(`Unlinked ${name} from ${USER_SKILLS}, since it is no longer global.`);
			for (const name of user.pruned)
				log.step(`Unlinked ${name} from ${USER_SKILLS}, since it is no longer in your library.`);

			const linkChanges = [inProject, user].reduce(
				(total, scope) =>
					total + (scope ? scope.added.length + scope.removed.length + scope.pruned.length : 0),
				0
			);

			if (changes.length === 0 && linkChanges === 0 && sent === 0)
				log.info('Everything is already in sync.');

			if (report.conflicts.length > 0) {
				log.blank();
				log.warn(
					`${report.conflicts.length} skill(s) changed in two places. The copy that lost is kept here:`
				);
				for (const conflict of report.conflicts) log.dim(`  ${conflict.stashedAt}`);
			}

			await settleRefresh(
				{ skipped: [...(inProject?.skipped ?? []), ...user.skipped] },
				{ yes: options.yes }
			);

			if (report.skipped.length > 0) {
				log.blank();
				log.dim(`Skipped ${report.skipped.join(', ')}.`);
			}
		});
	});
