import { Command, Option } from 'commander';
import { z } from 'zod';
import { clearToken, getToken, setToken } from '@/utils/auth';
import { login } from '@/utils/login';
import { log } from '@/utils/prompts';
import { VERSION } from '@/utils/version';
import { commonOptions, defaultCommandOptionsSchema, parseOptions, tryCommand } from './utils';

const schema = defaultCommandOptionsSchema.extend({
	logout: z.boolean(),
	token: z.string().optional()
});

export const auth = new Command('auth')
	.description('Sign in to skilless.dev, or sign out.')
	.addOption(new Option('--logout', 'Sign out on this machine.').default(false))
	.addOption(
		new Option(
			'--token <token>',
			'Save a token directly, for when the browser flow cannot reach localhost.'
		)
	)
	.addOption(commonOptions.cwd)
	.action(async (raw) => {
		const options = parseOptions(schema, raw);
		log.intro(VERSION);

		await tryCommand(async () => {
			if (options.logout) {
				if (!getToken()) {
					log.info('You were not signed in.');
					return;
				}

				clearToken();
				log.step('Signed out on this machine.');
				return;
			}

			if (options.token) {
				setToken(options.token);
				log.step('Token saved. You are signed in to skilless.dev.');
				return;
			}

			await login();
			log.step('Signed in to skilless.dev.');
		});
	});
