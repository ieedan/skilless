import { Command } from 'commander';
import pc from 'picocolors';
import { z } from 'zod';
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
	project: z.union([z.boolean(), z.string()]).optional()
});

export const list = new Command('list')
	.description('List your skills, or the ones added to this project.')
	.option('-p, --project [key]', 'List this project’s skills instead of your library.')
	.addOption(commonOptions.cwd)
	.action(async (raw) => {
		const options = parseOptions(schema, raw);
		log.intro(VERSION);

		await tryCommand(async () => {
			const api = requireApi();

			if (options.project !== undefined) {
				const key = requireProjectKey(
					options.cwd,
					typeof options.project === 'string' ? options.project : undefined
				);
				const skills = await api.getBindings(key);

				log.info(`${pc.bold(key)}`);
				log.blank();

				if (skills.length === 0) {
					log.dim('No skills in this project. Run `skilless add <skill>` to add one.');
					return;
				}

				for (const skill of skills) {
					log.dim(`  ${skill.name}${skill.global ? pc.gray(' · global') : ''}`);
				}
				return;
			}

			const skills = await api.listSkills();

			if (skills.length === 0) {
				log.dim('Your library is empty. Run `skilless create <name>` to make one.');
				return;
			}

			for (const skill of skills) {
				const when = new Date(skill.updatedAt).toISOString().slice(0, 10);
				const marker = skill.global ? ' · global' : '';
				log.dim(`  ${skill.name.padEnd(28)} ${pc.gray(when + marker)}`);
			}
		});
	});
