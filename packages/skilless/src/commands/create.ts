import { Command } from 'commander';
import path from 'pathe';
import { z } from 'zod';
import { SkillessError } from '@/utils/errors';
import * as git from '@/utils/git';
import { installSkills } from '@/utils/install';
import { skillDir } from '@/utils/paths';
import * as project from '@/utils/project';
import { input, isInteractive, log } from '@/utils/prompts';
import {
	assertValidName,
	findLocalSkill,
	isValidName,
	readSkill,
	scaffold,
	writeSkill
} from '@/utils/skill';
import { readState, writeState } from '@/utils/state';
import { VERSION } from '@/utils/version';
import {
	commonOptions,
	defaultCommandOptionsSchema,
	parseOptions,
	requireApi,
	tryCommand
} from './utils';

const schema = defaultCommandOptionsSchema.extend({
	description: z.string().optional(),
	project: z.string().optional()
});

const NAME_RULES = 'Use lowercase letters, digits, dots, dashes and underscores.';

export const create = new Command('create')
	.description('Create a skill, add it to this project, and print the path to edit it.')
	.argument('[name]', 'The name of the skill. You will be asked if you leave it out.')
	.option('-d, --description <description>', 'What the skill does, for the frontmatter.')
	.addOption(commonOptions.project)
	.addOption(commonOptions.cwd)
	.action(async (nameArg: string | undefined, raw) => {
		const options = parseOptions(schema, raw);
		log.intro(VERSION);

		await tryCommand(async () => {
			const api = requireApi();
			const taken = new Set((await api.listSkills()).map((skill) => skill.name));

			let name = nameArg;

			if (!name) {
				if (!isInteractive) {
					throw new SkillessError('No name given.', {
						suggestion: 'Run `skilless create <name>`.'
					});
				}

				name = await input('Name', {
					validate: (value) => {
						if (!value) return 'A name is required.';
						if (!isValidName(value)) return NAME_RULES;
						if (taken.has(value) || findLocalSkill(value)) {
							return `${value} already exists in your library.`;
						}
						return true;
					}
				});
			}

			assertValidName(name);

			if (findLocalSkill(name)) {
				throw new SkillessError(`${name} already exists in your library.`, {
					suggestion: `Edit it at ${path.join(skillDir(name), 'SKILL.md')}`
				});
			}

			if (taken.has(name)) {
				throw new SkillessError(`${name} already exists in your library.`, {
					suggestion: `Run \`skilless sync\` to bring ${name} down to this machine.`
				});
			}

			const description = options.description ?? (await input('What does this skill do?'));

			writeSkill(name, scaffold(name, description));

			const skill = readSkill(skillDir(name), name);
			await api.putSkill(name, skill.files, skill.editedAt);

			const state = readState();
			state.skills[name] = {
				contentHash: skill.contentHash,
				editedAt: skill.editedAt,
				syncedAt: Date.now()
			};
			writeState(state);

			log.step(`Created ${name} in your library.`);

			const key = options.project ?? git.projectKey(options.cwd);

			if (key) {
				const current = (await api.getBindings(key)).map((s) => s.name);
				await api.setBindings(key, [...new Set([...current, name])]);

				const root = project.projectRoot(options.cwd);
				// the whole resolved set, so any global skills land here too
				await installSkills(root, await api.getBindings(key), { reconcile: true });

				log.step(`Added ${name} to ${key}.`);
			} else {
				log.warn(`No git remote here, so ${name} was not added to a project.`);
			}

			log.blank();
			log.dim(`Edit ${name} at ${path.join(skillDir(name), 'SKILL.md')}`);
			log.dim('Run `skilless sync` to save your changes.');
		});
	});
