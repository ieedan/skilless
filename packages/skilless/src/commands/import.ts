import fs from 'node:fs';
import { Command } from 'commander';
import path from 'pathe';
import { z } from 'zod';
import { SkillessError } from '@/utils/errors';
import * as fsu from '@/utils/fs';
import { readLibrary, saveToLibrary } from '@/utils/library';
import { confirm, log } from '@/utils/prompts';
import { isValidName, readSkill, SKILL_FILE } from '@/utils/skill';
import type { LocalSkill } from '@/utils/types';
import { VERSION } from '@/utils/version';
import {
	commonOptions,
	defaultCommandOptionsSchema,
	load,
	parseOptions,
	remoteIf,
	tryCommand
} from './utils';

const schema = defaultCommandOptionsSchema.extend({
	yes: z.boolean(),
	overwrite: z.boolean(),
	sync: z.boolean().optional()
});

/** Any immediate subdirectory holding a SKILL.md is a skill. */
function discover(dir: string): { name: string; dir: string }[] {
	return fs
		.readdirSync(dir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => ({ name: entry.name, dir: path.join(dir, entry.name) }))
		.filter((candidate) => fsu.exists(path.join(candidate.dir, SKILL_FILE)))
		.sort((a, b) => a.name.localeCompare(b.name));
}

export const importCommand = new Command('import')
	.description('Import a directory of existing skills into your library.')
	.argument('<dir>', 'A directory whose subdirectories each contain a SKILL.md.')
	.option('--overwrite', 'Replace skills that already exist.', false)
	.addOption(commonOptions.yes)
	.addOption(commonOptions.sync)
	.addOption(commonOptions.cwd)
	.action(async (dir: string, raw) => {
		const options = parseOptions(schema, raw);
		log.intro(VERSION);

		await tryCommand(async () => {
			const remote = remoteIf(options.sync);
			const source = path.resolve(options.cwd, dir);

			if (!fsu.exists(source)) {
				throw new SkillessError(`${source} does not exist.`);
			}

			const candidates = discover(source);

			if (candidates.length === 0) {
				throw new SkillessError(`No skills found in ${source}.`, {
					suggestion: `A skill is a directory containing a ${SKILL_FILE}.`
				});
			}

			const library = await load(remote, () => readLibrary(remote));
			const existing = new Map(library.entries.map((skill) => [skill.name, skill]));

			const importable: LocalSkill[] = [];
			const skipped: { name: string; reason: string }[] = [];

			for (const candidate of candidates) {
				if (!isValidName(candidate.name)) {
					skipped.push({ name: candidate.name, reason: 'invalid name' });
					continue;
				}

				if (existing.has(candidate.name) && !options.overwrite) {
					skipped.push({ name: candidate.name, reason: 'already in your library' });
					continue;
				}

				try {
					importable.push(readSkill(candidate.dir, candidate.name));
				} catch (e) {
					skipped.push({
						name: candidate.name,
						reason: e instanceof Error ? e.message : 'unreadable'
					});
				}
			}

			for (const skip of skipped) log.warn(`Skipped ${skip.name}: ${skip.reason}.`);

			if (importable.length === 0) {
				log.info('Nothing to import.');
				remote?.report();
				return;
			}

			log.blank();
			log.info(`Importing: ${importable.map((skill) => skill.name).join(', ')}`);

			const ok = options.yes || (await confirm(`Import ${importable.length} skill(s)?`, true));
			if (!ok) return;

			const imported = saveToLibrary(importable, existing);

			for (const name of imported) {
				log.step(`Imported ${name} into your library.`);
			}

			log.blank();
			log.dim(
				`Run \`skilless add ${importable[0]?.name ?? '<skill>'}\` to add one to this project.`
			);

			remote?.report();
		});
	});
