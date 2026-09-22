import { Command } from 'commander';
import { getToken } from '@/utils/auth';
import * as fsu from '@/utils/fs';
import { login } from '@/utils/login';
import { SKILLESS_DIR, SKILLS_DIR } from '@/utils/paths';
import { confirm, log } from '@/utils/prompts';
import { VERSION } from '@/utils/version';
import { commonOptions, defaultCommandOptionsSchema, parseOptions, tryCommand } from './utils';

export const init = new Command('init')
	.description('Create the local skilless directory and sign in.')
	.addOption(commonOptions.cwd)
	.action(async (raw) => {
		parseOptions(defaultCommandOptionsSchema, raw);
		log.intro(VERSION);

		await tryCommand(async () => {
			const fresh = !fsu.exists(SKILLS_DIR);
			fsu.ensureDir(SKILLS_DIR);

			log.step(`${fresh ? 'Created' : 'Found'} your library at ${SKILLESS_DIR}.`);

			if (getToken()) {
				const again = await confirm('You are already signed in. Sign in again?', false);
				if (!again) {
					log.blank();
					log.dim('Run `skilless create <name>` to make a skill.');
					return;
				}
			}

			await login();

			log.step('Signed in to skilless.dev.');
			log.blank();
			log.dim('Run `skilless create <name>` to make a skill.');
			log.dim('Run `skilless add <skill>` to add one you already have.');
		});
	});
