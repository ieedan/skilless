import { Command } from 'commander';
import path from 'pathe';
import { z } from 'zod';
import { readConfig } from '@/utils/config';
import { EDITORS, isTerminalEditor, openInEditor } from '@/utils/editor';
import { SkillessError } from '@/utils/errors';
import * as git from '@/utils/git';
import { flush, readLibrary, refreshGlobals, refreshProject } from '@/utils/library';
import { queueBind, queueGlobal } from '@/utils/pending';
import { skillDir } from '@/utils/paths';
import * as project from '@/utils/project';
import { input, isInteractive, log, spin } from '@/utils/prompts';
import { Remote } from '@/utils/remote';
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
	tryCommand,
	settleRefresh
} from './utils';

const schema = defaultCommandOptionsSchema.extend({
	description: z.string().optional(),
	project: z.string().optional(),
	global: z.boolean().optional(),
	open: z.boolean()
});

const NAME_RULES = 'Use lowercase letters, digits, dots, dashes and underscores.';

export const create = new Command('create')
	.description('Create a skill, add it to this project, and print the path to edit it.')
	.argument('[name]', 'The name of the skill. You will be asked if you leave it out.')
	.option('-d, --description <description>', 'What the skill does, for the frontmatter.')
	.option(
		'-g, --global',
		'Make it global: linked once into ~/.agents/skills and ~/.claude/skills, so every project has it, including cloud agents.'
	)
	.option('--no-open', 'Do not open SKILL.md in your editor (see `skilless config editor`).')
	.addOption(commonOptions.project)
	.addOption(commonOptions.cwd)
	.action(async (nameArg: string | undefined, raw) => {
		const options = parseOptions(schema, raw);
		log.intro(VERSION);

		await tryCommand(async () => {
			const remote = new Remote();
			const library = await spin('Loading your library', async () => {
				await flush(remote);
				return readLibrary(remote);
			});
			const taken = new Set(library.entries.map((skill) => skill.name));

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
						if (taken.has(value)) return `${value} already exists in your library.`;
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

			// left out of state.json if this does not go through, which is exactly
			// what makes the next sync push it
			const skill = readSkill(skillDir(name), name);
			const pushed = await spin(`Creating ${name}`, () =>
				remote.try((api) => api.putSkill(name, skill.files, skill.editedAt))
			);

			if (pushed) {
				const state = readState();
				state.skills[name] = {
					contentHash: skill.contentHash,
					editedAt: skill.editedAt,
					syncedAt: Date.now()
				};
				writeState(state);
			}

			log.step(`Created ${name} in your library.`);

			// a global skill needs no binding — it is linked once at the user
			// level, which every project sees
			if (options.global) queueGlobal([name], true);

			const key = options.project ?? git.projectKey(options.cwd);

			if (key) {
				if (!options.global) queueBind(key, [name]);

				const root = project.projectRoot(options.cwd);
				// the whole resolved set, so any global skills land too
				const result = await spin('Updating this project', async () => {
					await flush(remote);
					return refreshProject(remote, root, key);
				});
				await settleRefresh(result);
			} else if (options.global) {
				const result = await spin('Linking your global skills', async () => {
					await flush(remote);
					return refreshGlobals(remote);
				});
				await settleRefresh(result);
			} else {
				await spin('Saving to skilless.dev', () => flush(remote));
			}

			if (options.global) log.step(`${name} is now global, so every project has it.`);
			else if (key) log.step(`Added ${name} to ${key}.`);
			else log.warn(`No git remote here, so ${name} was not added to a project.`);

			const file = path.join(skillDir(name), 'SKILL.md');
			const editor = options.open ? readConfig().editor : undefined;
			// a terminal editor needs this terminal, which a script or pipe does not have
			const canOpen = editor && (!isTerminalEditor(editor) || isInteractive);

			log.blank();

			if (editor && canOpen) {
				try {
					log.dim(`Opening ${name} in ${EDITORS[editor].label}...`);
					await openInEditor(editor, file);
				} catch (e) {
					log.warn(e instanceof Error ? e.message : String(e));
					log.dim(`Edit ${name} at ${file}`);
				}
			} else {
				log.dim(`Edit ${name} at ${file}`);
			}

			if (remote.api) log.dim('Run `skilless sync` to save your changes.');

			remote.report();
		});
	});
