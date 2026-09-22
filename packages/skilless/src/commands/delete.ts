import { Command } from 'commander';
import { z } from 'zod';
import * as fsu from '@/utils/fs';
import { skillDir } from '@/utils/paths';
import * as project from '@/utils/project';
import { confirm, log } from '@/utils/prompts';
import { readState, writeState } from '@/utils/state';
import { VERSION } from '@/utils/version';
import {
	commonOptions,
	defaultCommandOptionsSchema,
	parseOptions,
	requireApi,
	tryCommand
} from './utils';

const schema = defaultCommandOptionsSchema.extend({
	yes: z.boolean()
});

/**
 * Destructive on purpose — this deletes the skill, not just its link here. Undo
 * lives on the website, where deleted skills sit in a 30 day trash.
 */
export const deleteCommand = new Command('delete')
	.description('Delete skills from your library, everywhere.')
	.argument('<skills...>', 'Skills to delete.')
	.addOption(commonOptions.yes)
	.addOption(commonOptions.cwd)
	.action(async (names: string[], raw) => {
		const options = parseOptions(schema, raw);
		log.intro(VERSION);

		await tryCommand(async () => {
			const api = requireApi();

			log.warn(`This deletes ${names.join(', ')} from every project, on every machine.`);
			log.dim(
				`Run \`skilless remove ${names.join(' ')}\` to take ${
					names.length === 1 ? 'it' : 'them'
				} out of just this project.`
			);

			const ok = options.yes || (await confirm(`Delete ${names.join(', ')}?`, false));

			if (!ok) {
				log.info('Nothing was deleted.');
				return;
			}

			const state = readState();
			const root = project.projectRoot(options.cwd);

			for (const name of names) {
				await api.deleteSkill(name);
				fsu.remove(skillDir(name));
				delete state.skills[name];

				log.step(`Deleted ${name} from your library.`);
			}

			writeState(state);
			project.unmaterialize(root, names);

			log.blank();
			log.dim('Other checkouts will clean up on their next `skilless install`.');
			log.dim('Restore at skilless.dev/skills within 30 days.');
		});
	});
