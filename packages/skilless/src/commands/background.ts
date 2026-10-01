import { Command } from 'commander';
import { ApiClient } from '@/utils/api';
import { getApiUrl, getToken } from '@/utils/auth';
import { BACKGROUND_COMMAND, runBackground } from '@/utils/background';

/** Started detached by other commands. Not for people, so it is hidden from help. */
export const background = new Command(BACKGROUND_COMMAND)
	.description('Push changes to skilless.dev and check it for new ones.')
	.option('--push', 'Send what changed on this machine.')
	.option('--check', 'Look for changes made elsewhere.')
	.option('--key <key>', 'The project to check.')
	.action(async (opts: { push?: boolean; check?: boolean; key?: string }) => {
		const token = getToken();
		if (!token) return;

		// nobody is watching, so a failure has nowhere to go but background.json
		await runBackground(new ApiClient(token, getApiUrl()), {
			push: opts.push === true,
			check: opts.check === true,
			key: opts.key ?? null
		}).catch(() => {});
	});
