import { Command } from 'commander';
import { z } from 'zod';
import { pushInBackground } from '@/utils/background';
import { readBindings, readLibrary, refreshProject } from '@/utils/library';
import { queueUnbind } from '@/utils/pending';
import * as project from '@/utils/project';
import { log } from '@/utils/prompts';
import { VERSION } from '@/utils/version';
import {
	commonOptions,
	defaultCommandOptionsSchema,
	load,
	parseOptions,
	remoteIf,
	requireProjectKey,
	tryCommand,
	settleRefresh
} from './utils';

const schema = defaultCommandOptionsSchema.extend({
	project: z.string().optional(),
	copy: z.boolean().optional(),
	sync: z.boolean().optional()
});

/** The inverse of `add`. Non destructive — `delete` is the one that removes a skill. */
export const remove = new Command('remove')
	.description('Remove skills from this project. They stay in your library.')
	.argument('<skills...>', 'Skills to remove.')
	.option('--copy', 'Write real files instead of symlinking into the store.')
	.addOption(commonOptions.project)
	.addOption(commonOptions.sync)
	.addOption(commonOptions.cwd)
	.action(async (names: string[], raw) => {
		const options = parseOptions(schema, raw);
		log.intro(VERSION);

		await tryCommand(async () => {
			const remote = remoteIf(options.sync);
			const key = requireProjectKey(options.cwd, options.project);

			const [library, bound] = await load(remote, () =>
				Promise.all([readLibrary(remote), readBindings(remote, key).then((b) => new Set(b))])
			);
			const globals = new Set(
				library.entries.filter((skill) => skill.global).map((skill) => skill.name)
			);

			const removing: string[] = [];

			for (const name of names) {
				if (globals.has(name)) {
					log.warn(`${name} is global, so it is in every project.`);
					log.dim(`  Run \`skilless add --not-global ${name}\` to take it out of every project.`);
					continue;
				}

				if (!bound.has(name)) {
					log.warn(`${name} is not in this project.`);
					continue;
				}

				removing.push(name);
			}

			if (removing.length === 0) {
				remote?.report();
				return;
			}

			queueUnbind(key, removing);
			pushInBackground();

			const root = project.projectRoot(options.cwd);
			const result = await refreshProject(null, root, key, { copy: options.copy });

			for (const name of removing) log.step(`Removed ${name} from this project.`);

			await settleRefresh(result, { copy: options.copy });

			log.blank();
			log.dim(
				`Run \`skilless delete ${removing.join(' ')}\` to delete ${
					removing.length === 1 ? 'it' : 'them'
				}.`
			);

			remote?.report();
		});
	});
