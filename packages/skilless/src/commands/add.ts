import { Command } from 'commander';
import { z } from 'zod';
import { SkillessError } from '@/utils/errors';
import * as git from '@/utils/git';
import { installSkills } from '@/utils/install';
import * as project from '@/utils/project';
import { log, multiselect } from '@/utils/prompts';
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
	copy: z.boolean().optional(),
	global: z.boolean().optional(),
	notGlobal: z.boolean().optional()
});

export const add = new Command('add')
	.description('Add skills from your library to this project.')
	.argument('[skills...]', 'Skills to add. Omit to pick from a list.')
	.option('-g, --global', 'Make these skills part of every project, including cloud agents.')
	.option('--not-global', 'Stop treating these skills as global.')
	.option('--copy', 'Write real files instead of symlinking into the store.')
	.addOption(commonOptions.project)
	.addOption(commonOptions.cwd)
	.action(async (names: string[], raw) => {
		const options = parseOptions(schema, raw);
		log.intro(VERSION);

		await tryCommand(async () => {
			const api = requireApi();
			const library = await api.listSkills();

			const known = new Set(library.map((skill) => skill.name));
			const unknown = names.filter((name) => !known.has(name));

			if (unknown.length > 0) {
				throw new SkillessError(`Not in your library: ${unknown.join(', ')}`, {
					suggestion: 'Run `skilless list` to see what you have.'
				});
			}

			/* ------------------------------------------------------------ global */

			if (options.global || options.notGlobal) {
				const value = options.global === true;
				let selected = names;

				if (selected.length === 0) {
					const candidates = library.filter((skill) => skill.global !== value);

					if (candidates.length === 0) {
						log.info(
							value
								? 'Every skill in your library is already global.'
								: 'No skills in your library are global.'
						);
						return;
					}

					selected = await multiselect(
						value ? 'Make global' : 'Stop being global',
						candidates.map((skill) => ({ name: skill.name }))
					);

					if (selected.length === 0) {
						log.info('Nothing selected.');
						return;
					}
				}

				for (const name of selected) {
					await api.setGlobal(name, value);
					log.step(value ? `${name} is now in every project.` : `${name} is out of every project.`);
				}

				// a global skill needs no binding, so there is nothing to add here —
				// but this project's files should still catch up
				const key = options.project ?? git.projectKey(options.cwd);

				if (key) {
					const root = project.projectRoot(options.cwd);
					const result = await installSkills(root, await api.getBindings(key), {
						copy: options.copy,
						reconcile: true
					});

					for (const name of result.removed) log.dim(`Removed ${name} from this project.`);
				}

				return;
			}

			/* ----------------------------------------------------------- project */

			const key = requireProjectKey(options.cwd, options.project);
			const bound = new Set((await api.getBindings(key)).map((skill) => skill.name));

			let selected = names;

			if (selected.length === 0) {
				const available = library.filter((skill) => !bound.has(skill.name));

				if (available.length === 0) {
					log.info('Every skill in your library is already in this project.');
					return;
				}

				selected = await multiselect(
					`Add to ${key}`,
					available.map((skill) => ({ name: skill.name }))
				);

				if (selected.length === 0) {
					log.info('Nothing selected.');
					return;
				}
			}

			// globals are already in every project, so binding them would be a no-op
			const globals = new Set(library.filter((skill) => skill.global).map((skill) => skill.name));

			for (const name of selected) {
				if (globals.has(name)) log.dim(`${name} is global, so it is already in this project.`);
			}

			const toBind = selected.filter((name) => !globals.has(name));
			const result = await api.setBindings(key, [...new Set([...bound, ...toBind])]);

			const root = project.projectRoot(options.cwd);
			const installed = await installSkills(root, await api.getBindings(key), {
				copy: options.copy,
				reconcile: true
			});

			for (const name of toBind) {
				if (result.bound.includes(name)) log.step(`Added ${name} to this project.`);
			}

			for (const skip of installed.skipped) {
				log.warn(
					skip.reason === 'tracked'
						? `\`${skip.name}\` is tracked by git here — left alone.`
						: `\`${skip.name}\` already exists here and is not ours — left alone.`
				);
			}
		});
	});
