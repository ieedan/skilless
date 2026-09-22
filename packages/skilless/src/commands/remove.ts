import { Command } from 'commander';
import { z } from 'zod';
import { installSkills } from '@/utils/install';
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

/** The inverse of `add`. Non destructive — `delete` is the one that removes a skill. */
export const remove = new Command('remove')
	.description('Remove skills from this project. They stay in your library.')
	.argument('<skills...>', 'Skills to remove.')
	.option('--copy', 'Write real files instead of symlinking into the store.')
	.addOption(commonOptions.project)
	.addOption(commonOptions.cwd)
	.action(async (names: string[], raw) => {
		const options = parseOptions(schema, raw);
		log.intro(VERSION);

		await tryCommand(async () => {
			const api = requireApi();
			const key = requireProjectKey(options.cwd, options.project);

			const resolved = await api.getBindings(key);
			const present = new Map(resolved.map((skill) => [skill.name, skill]));

			const keep: string[] = [];
			let removedAny = false;

			for (const skill of resolved) {
				if (!names.includes(skill.name)) {
					// globals are not bindings, so they must not be written back as ones
					if (!skill.global) keep.push(skill.name);
					continue;
				}

				if (skill.global) {
					log.warn(`${skill.name} is global, so it is in every project.`);
					log.dim(
						`  Run \`skilless add --not-global ${skill.name}\` to take it out of every project.`
					);
					continue;
				}

				removedAny = true;
			}

			for (const name of names) {
				if (!present.has(name)) log.warn(`${name} is not in this project.`);
			}

			if (!removedAny) return;

			await api.setBindings(key, keep);

			const root = project.projectRoot(options.cwd);
			const result = await installSkills(root, await api.getBindings(key), {
				copy: options.copy,
				reconcile: true
			});

			for (const name of result.removed) {
				log.step(`Removed ${name} from this project.`);
			}

			if (result.removed.length > 0) {
				log.blank();
				log.dim(
					`Run \`skilless delete ${result.removed.join(' ')}\` to delete ${
						result.removed.length === 1 ? 'it' : 'them'
					}.`
				);
			}
		});
	});
