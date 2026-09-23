import { Command } from 'commander';
import { z } from 'zod';
import { installProject, shouldCopy } from '@/utils/install';
import { flushPending } from '@/utils/pending';
import * as project from '@/utils/project';
import { log, spin } from '@/utils/prompts';
import { VERSION } from '@/utils/version';
import {
	commonOptions,
	defaultCommandOptionsSchema,
	parseOptions,
	requireApi,
	requireProjectKey,
	tryCommand,
	USER_SKILLS,
	settleRefresh
} from './utils';

const schema = defaultCommandOptionsSchema.extend({
	project: z.string().optional(),
	copy: z.boolean().optional()
});

/**
 * The cloud agent entry point. It must work with nothing but SKILLESS_TOKEN and a
 * git remote — no local store, no prompts, no interactive anything.
 */
export const install = new Command('install')
	.description(
		'Install every skill added to this project, and your global skills at the user level.'
	)
	.option('--copy', 'Write real files instead of symlinking into the store.')
	.addOption(commonOptions.project)
	.addOption(commonOptions.cwd)
	.action(async (raw) => {
		const options = parseOptions(schema, raw);
		log.intro(VERSION);

		await tryCommand(async () => {
			const api = requireApi();
			const key = requireProjectKey(options.cwd, options.project);
			const root = project.projectRoot(options.cwd);

			const result = await spin(`Installing ${key}'s skills`, async () => {
				await flushPending(api);
				return installProject(api, root, key, { copy: options.copy });
			});

			const { project: inProject, user } = result;

			for (const name of [...inProject.pruned, ...user.pruned])
				log.dim(`Pruned ${name}, which is no longer in your library.`);
			for (const name of [...inProject.fetched, ...user.fetched])
				log.dim(`Fetched ${name} from your library.`);
			for (const name of inProject.removed)
				log.dim(`Removed ${name}, which is no longer in this project.`);
			for (const name of user.removed)
				log.dim(`Removed ${name} from ${USER_SKILLS}, since it is no longer global.`);
			for (const name of inProject.written) log.step(`Installed ${name}.`);
			for (const name of user.written) log.step(`Installed ${name} globally.`);

			if (result.count === 0) {
				log.info(`No skills added to ${key} yet.`);
				log.dim('Run `skilless add <skill>` to add one.');
				return;
			}

			await settleRefresh(result, { copy: options.copy });

			log.blank();
			log.dim(
				shouldCopy(options.copy)
					? 'Wrote real files into .agents/skills, and global skills into ~/.agents/skills.'
					: 'Linked .agents/skills, and global skills in ~/.agents/skills, to your library.'
			);
		});
	});
