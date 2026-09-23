import { Command } from 'commander';
import { z } from 'zod';
import { SkillessError } from '@/utils/errors';
import * as git from '@/utils/git';
import { flush, readBindings, readLibrary } from '@/utils/library';
import { AGENTS_SKILLS, CLAUDE_SKILLS } from '@/utils/paths';
import { queueUnbind } from '@/utils/pending';
import * as project from '@/utils/project';
import { confirm, isInteractive, log, multiselect, spin } from '@/utils/prompts';
import { Remote } from '@/utils/remote';
import type { SkillFile } from '@/utils/types';
import { VERSION } from '@/utils/version';
import { commonOptions, defaultCommandOptionsSchema, parseOptions, tryCommand } from './utils';

const schema = defaultCommandOptionsSchema.extend({
	project: z.string().optional(),
	yes: z.boolean()
});

/**
 * Copies skills into the repo for good: real files in `.agents/skills`, meant
 * to be committed, so anyone who clones it has them without skilless. The
 * skill is taken out of this project in skilless, which leaves the copy alone
 * from then on. Vendoring again refreshes it from your library.
 */
export const vendor = new Command('vendor')
	.description('Copy skills into this repo as real files to commit, instead of linking them.')
	.argument('[skills...]', 'Skills to vendor. Omit to pick from a list.')
	.addOption(commonOptions.yes)
	.addOption(commonOptions.project)
	.addOption(commonOptions.cwd)
	.action(async (names: string[], raw) => {
		const options = parseOptions(schema, raw);
		log.intro(VERSION);

		await tryCommand(async () => {
			const root = git.repoRoot(options.cwd);
			if (!root) {
				throw new SkillessError('This directory is not in a git repo.', {
					suggestion: 'Vendored skills are meant to be committed, so run this inside one.'
				});
			}

			const remote = new Remote();
			const key = options.project ?? git.projectKey(options.cwd);

			const [library, bound] = await spin('Loading your library', async () => {
				await flush(remote);
				return [
					await readLibrary(remote),
					new Set(key ? await readBindings(remote, key) : [])
				] as const;
			});

			const known = new Map(library.entries.map((skill) => [skill.name, skill]));
			const unknown = names.filter((name) => !known.has(name));

			if (unknown.length > 0) {
				throw new SkillessError(`Not in your library: ${unknown.join(', ')}`, {
					suggestion: 'Run `skilless list` to see what you have.'
				});
			}

			let selected = names;

			if (selected.length === 0) {
				if (library.entries.length === 0) {
					log.info('Your library is empty.');
					remote.report();
					return;
				}

				selected = await multiselect(
					'Vendor into this repo',
					library.entries.map((skill) => ({
						name: skill.name,
						...(bound.has(skill.name) ? { hint: 'in this project' } : {})
					}))
				);

				if (selected.length === 0) {
					log.info('Nothing selected.');
					return;
				}
			}

			const vendored: string[] = [];

			for (const name of selected) {
				const files = await spin(`Reading ${name}`, () => filesOf(remote, known.get(name)!));

				if (!files) {
					log.warn(`${name} is not on this machine, and the server can't be reached to fetch it.`);
					continue;
				}

				const inTheWay = project.blocking(root, name);

				if (inTheWay.length > 0) {
					const where = inTheWay.join(' and ');
					const replace =
						options.yes || (isInteractive && (await confirm(`Overwrite ${where}?`, false)));

					if (!replace) {
						log.warn(`Skipped ${name}: ${where} was not made by skilless.`);
						if (!isInteractive) log.dim('  Run this in a terminal to overwrite it, or pass --yes.');
						continue;
					}
				}

				project.vendor(root, { name, files });
				vendored.push(name);
				log.step(`Vendored ${name} into ${AGENTS_SKILLS}/${name}.`);
			}

			if (vendored.length === 0) {
				remote.report();
				return;
			}

			// the repo owns these now, so skilless must not link over them
			const unbinding = key ? vendored.filter((name) => bound.has(name)) : [];

			if (key && unbinding.length > 0) {
				queueUnbind(key, unbinding);
				await spin('Updating this project', () => flush(remote));

				for (const name of unbinding) log.dim(`Took ${name} out of this project in skilless.`);
			}

			for (const name of vendored.filter((name) => known.get(name)!.global)) {
				log.dim(`${name} is global, so it is also still linked at the user level.`);
			}

			log.blank();
			log.dim(
				`Commit ${vendored
					.flatMap((name) => [`${AGENTS_SKILLS}/${name}`, `${CLAUDE_SKILLS}/${name}`])
					.join(', ')} to share ${vendored.length === 1 ? 'it' : 'them'}.`
			);

			remote.report();
		});
	});

/** A skill's files: from the store when it is on this machine, else from the server. */
async function filesOf(
	remote: Remote,
	entry: { name: string; local: { files: SkillFile[] } | null }
): Promise<SkillFile[] | null> {
	if (entry.local) return entry.local.files;

	const fetched = await remote.try((api) => api.getSkill(entry.name));
	return fetched?.files ?? null;
}
