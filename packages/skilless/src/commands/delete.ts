import { Command } from 'commander';
import { z } from 'zod';
import { SkillessError } from '@/utils/errors';
import * as fsu from '@/utils/fs';
import { flush, readLibrary } from '@/utils/library';
import { skillDir } from '@/utils/paths';
import { queueDelete } from '@/utils/pending';
import { dropSources } from '@/utils/sources';
import * as project from '@/utils/project';
import { confirm, log, spin } from '@/utils/prompts';
import { Remote } from '@/utils/remote';
import { readState, writeState } from '@/utils/state';
import { VERSION } from '@/utils/version';
import { commonOptions, defaultCommandOptionsSchema, parseOptions, tryCommand } from './utils';

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
			const remote = new Remote();
			const library = await spin('Loading your library', async () => {
				await flush(remote);
				return readLibrary(remote);
			});
			const known = new Set(library.entries.map((skill) => skill.name));
			const unknown = names.filter((name) => !known.has(name));

			if (unknown.length > 0) {
				throw new SkillessError(`Not in your library: ${unknown.join(', ')}`, {
					suggestion: 'Run `skilless list` to see what you have.'
				});
			}

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

			// queued before anything is removed here, so the deletion is never lost
			// even if the server cannot hear about it yet
			queueDelete(names);
			dropSources(names);

			const state = readState();
			const root = project.projectRoot(options.cwd);

			for (const name of names) {
				fsu.remove(skillDir(name));
				delete state.skills[name];

				log.step(`Deleted ${name} from your library.`);
			}

			writeState(state);
			project.unmaterialize(root, names);
			project.unmaterialize(project.userScope(), names);

			await spin('Deleting from skilless.dev', () => flush(remote));

			log.blank();
			log.dim('Other checkouts will clean up on their next `skilless install`.');
			log.dim('Restore at skilless.dev/skills within 30 days.');

			remote.report();
		});
	});
