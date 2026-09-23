import { Command } from 'commander';
import pc from 'picocolors';
import { z } from 'zod';
import { normalizeRemote } from '@/utils/git';
import {
	flush,
	type LibraryEntry,
	readBindings,
	readLibrary,
	resolveProject
} from '@/utils/library';
import { log, spin } from '@/utils/prompts';
import { Remote } from '@/utils/remote';
import { VERSION } from '@/utils/version';
import {
	commonOptions,
	defaultCommandOptionsSchema,
	parseOptions,
	requireProjectKey,
	tryCommand
} from './utils';

const schema = defaultCommandOptionsSchema.extend({
	project: z.union([z.boolean(), z.string()]).optional()
});

/** `synced` is off when signed out, where "not synced" would tag every skill. */
function markers(skill: LibraryEntry, synced: boolean): string {
	const out: string[] = [];

	if (skill.global) out.push('global');
	if (skill.source) out.push(`from ${normalizeRemote(skill.source.url) ?? skill.source.url}`);
	if (!skill.local) out.push('not on this machine');
	else if (synced && skill.unsynced) out.push('not synced');

	return out.map((marker) => ` · ${marker}`).join('');
}

export const list = new Command('list')
	.description('List your skills, or the ones added to this project.')
	.option('-p, --project [key]', 'List this project’s skills instead of your library.')
	.addOption(commonOptions.cwd)
	.action(async (raw) => {
		const options = parseOptions(schema, raw);
		log.intro(VERSION);

		await tryCommand(async () => {
			const remote = new Remote();
			const library = await spin('Loading your library', async () => {
				await flush(remote);
				return readLibrary(remote);
			});

			if (options.project !== undefined) {
				const key = requireProjectKey(
					options.cwd,
					typeof options.project === 'string' ? options.project : undefined
				);
				const bound = await spin(`Loading ${key}`, () => readBindings(remote, key));
				const skills = resolveProject(library, bound);

				log.info(`${pc.bold(key)}`);
				log.blank();

				if (skills.length === 0) {
					log.dim('No skills in this project. Run `skilless add <skill>` to add one.');
				}

				for (const skill of skills)
					log.dim(`  ${skill.name}${pc.gray(markers(skill, remote.api !== null))}`);

				remote.report();
				return;
			}

			if (library.entries.length === 0) {
				log.dim('Your library is empty. Run `skilless create <name>` to make one.');
			}

			for (const skill of library.entries) {
				const updatedAt = skill.local?.editedAt ?? skill.remote?.updatedAt ?? 0;
				const when = new Date(updatedAt).toISOString().slice(0, 10);
				log.dim(
					`  ${skill.name.padEnd(28)} ${pc.gray(when + markers(skill, remote.api !== null))}`
				);
			}

			remote.report();
		});
	});
