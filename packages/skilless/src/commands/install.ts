import { Command } from 'commander';
import { z } from 'zod';
import { installSkills, shouldCopy } from '@/utils/install';
import * as project from '@/utils/project';
import { log } from '@/utils/prompts';
import { VERSION } from '@/utils/version';
import {
	commonOptions,
	defaultCommandOptionsSchema,
	parseOptions,
	requireApi,
	requireProjectKey,
	tryCommand
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
	.description('Install every skill added to this project.')
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

			const pruned = project.prune(root);
			for (const name of pruned) log.dim(`Pruned ${name}, which is no longer in your library.`);

			const skills = await api.getBindings(key);

			if (skills.length === 0) {
				log.info(`No skills added to ${key} yet.`);
				log.dim('Run `skilless add <skill>` to add one.');
				return;
			}

			const result = await installSkills(root, skills, {
				copy: options.copy,
				reconcile: true
			});

			for (const name of result.fetched) log.dim(`Fetched ${name} from your library.`);
			for (const name of result.removed)
				log.dim(`Removed ${name}, which is no longer in this project.`);
			for (const name of result.written) log.step(`Installed ${name}.`);

			for (const skip of result.skipped) {
				log.warn(
					skip.reason === 'tracked'
						? `\`${skip.name}\` is tracked by git here — left alone.`
						: `\`${skip.name}\` already exists here and is not ours — left alone.`
				);
			}

			log.blank();
			log.dim(
				shouldCopy(options.copy)
					? 'Wrote real files into .agents/skills.'
					: 'Linked .agents/skills to your library.'
			);
		});
	});
