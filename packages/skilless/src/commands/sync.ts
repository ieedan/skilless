import { Command } from 'commander';
import { z } from 'zod';
import { log } from '@/utils/prompts';
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
	tryCommand
} from './utils';

const schema = defaultCommandOptionsSchema.extend({
	yes: z.boolean(),
	push: z.boolean().optional(),
	pull: z.boolean().optional()
});

export const sync = new Command('sync')
	.description('Sync your library with skilless.dev, in both directions.')
	.option('--push', 'On a conflict, keep the local copy.')
	.option('--pull', 'On a conflict, keep the remote copy.')
	.addOption(commonOptions.yes)
	.addOption(commonOptions.cwd)
	.action(async (raw) => {
		const options = parseOptions(schema, raw);
		log.intro(VERSION);

		await tryCommand(async () => {
			const api = requireApi();

			const local = new Map<string, LocalSkill>(
				listLocalSkills().map((skill) => [skill.name, skill])
			);
			const remote = new Map<string, RemoteSkill>(
				(await api.listSkills()).map((skill) => [skill.name, skill])
			);

			const state = readState();
			const force: Side | undefined = options.push ? 'push' : options.pull ? 'pull' : undefined;

			const actions = planSync(local, remote, state, force);
			const report = await applySync(api, actions, { local, state, yes: options.yes });

			writeState(state);

			const changes = report.actions.map(describe).filter((line) => line !== null);

			if (changes.length === 0) {
				log.info('Everything is already in sync.');
				return;
			}

			for (const line of changes) log.step(line);

			if (report.conflicts.length > 0) {
				log.blank();
				log.warn(
					`${report.conflicts.length} skill(s) changed in two places. The copy that lost is kept here:`
				);
				for (const conflict of report.conflicts) log.dim(`  ${conflict.stashedAt}`);
			}

			if (report.skipped.length > 0) {
				log.blank();
				log.dim(`Skipped ${report.skipped.join(', ')}.`);
			}
		});
	});
