import { Command } from 'commander';
import { getToken } from '@/utils/auth';
import * as fsu from '@/utils/fs';
import { SKILLESS_DIR, SKILLS_DIR } from '@/utils/paths';
import { log } from '@/utils/prompts';
import { VERSION } from '@/utils/version';
import { commonOptions, defaultCommandOptionsSchema, parseOptions, tryCommand } from './utils';

/**
 * Local first: the library works on its own, so signing in is left to
 * `skilless auth` for whoever wants their skills synced.
 */
export const init = new Command('init')
	.description('Create the local skilless directory.')
	.addOption(commonOptions.cwd)
	.action(async (raw) => {
		parseOptions(defaultCommandOptionsSchema, raw);
		log.intro(VERSION);

		await tryCommand(async () => {
			const fresh = !fsu.exists(SKILLS_DIR);
			fsu.ensureDir(SKILLS_DIR);

			log.step(`${fresh ? 'Created' : 'Found'} your library at ${SKILLESS_DIR}.`);

			log.blank();
			log.dim('Run `skilless create <name>` to make a skill.');
			log.dim('Run `skilless import <dir>` to bring in skills you already have.');
			if (!getToken()) log.dim('Run `skilless auth` to sync your skills with the cloud.');
		});
	});
