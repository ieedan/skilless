import { Command } from 'commander';
import pc from 'picocolors';
import { z } from 'zod';
import { projectKey } from '@/utils/git';
import { type LibraryEntry, readBindings, readLibrary, resolveProject } from '@/utils/library';
import { getToken } from '@/utils/auth';
import { folderSkills, ownedSkills, projectRoot } from '@/utils/project';
import fs from 'node:fs';
import path from 'pathe';
import { AGENTS_SKILLS, CLAUDE_SKILLS } from '@/utils/paths';
import { log, wrap } from '@/utils/prompts';
import { SKILL_FILE } from '@/utils/skill';
import { frontmatter } from '@/utils/source';
import { VERSION } from '@/utils/version';
import {
	commonOptions,
	defaultCommandOptionsSchema,
	load,
	parseOptions,
	remoteIf,
	skillDetails,
	tryCommand
} from './utils';

const schema = defaultCommandOptionsSchema.extend({
	lib: z.boolean().optional(),
	details: z.boolean().optional(),
	sync: z.boolean().optional(),
	project: z.union([z.boolean(), z.string()]).optional()
});

/** Plain text glyphs rather than emoji, so they take the terminal's own font and color. */
const GLOBAL = '⊕';
const FOLDER = '⌂';

/** A skill as it reads in the list: how it reaches the agents, then gray details. */
type Row = { name: string; icon: string | null; details: string[]; description?: string };

/** What a skill says it does, from its SKILL.md frontmatter. */
function describe(contents: string | undefined): string | undefined {
	return contents === undefined ? undefined : frontmatter(contents).description;
}

/** A skill in the project's own folders, read from whichever one holds it. */
function folderRow(root: string, name: string): Row {
	const file = [AGENTS_SKILLS, CLAUDE_SKILLS]
		.map((dir) => path.join(root, dir, name, SKILL_FILE))
		.find((candidate) => fs.existsSync(candidate));

	return {
		name,
		icon: FOLDER,
		details: [],
		description: describe(file ? fs.readFileSync(file, 'utf8') : undefined)
	};
}

function libraryRow(skill: LibraryEntry, synced: boolean): Row {
	return {
		name: skill.name,
		icon: skill.global ? GLOBAL : null,
		details: skillDetails(skill, synced),
		// a skill only on the server has no files here to read it from
		description: describe(skill.local?.files.find((file) => file.path === SKILL_FILE)?.contents)
	};
}

function print(rows: Row[], details: boolean): void {
	const width = Math.max(...rows.map((row) => row.name.length)) + 2;
	const iconless = rows.every((row) => row.icon === null);

	for (const [i, row] of rows.entries()) {
		const icon = iconless ? '' : `${row.icon ?? ' '} `;
		log.raw(`  ${row.name.padEnd(width)}${icon}${pc.gray(row.details.join(' · '))}`.trimEnd());

		if (!details) continue;

		if (row.description)
			process.stdout.write(pc.gray(wrap(row.description.split(/\s+/), ' ', '    ')));
		// a gap between skills, or the descriptions run together
		if (i < rows.length - 1) log.blank();
	}
}

export const list = new Command('list')
	.description('List the skills this project’s agents get, or your whole library.')
	.option('-l, --lib', 'List every skill in your library.')
	.option('-d, --details', 'Show what each skill does, from its SKILL.md.')
	.option('-p, --project [key]', 'List another project’s skills.')
	.addOption(commonOptions.sync)
	.addOption(commonOptions.cwd)
	.action(async (raw) => {
		const options = parseOptions(schema, raw);
		log.intro(VERSION);

		await tryCommand(async () => {
			const here = projectKey(options.cwd);
			const key = options.lib ? null : typeof options.project === 'string' ? options.project : here;

			// everything is on this machine already: the store, the cache of what the
			// server last said, and the links themselves. The server is only asked with --sync
			const remote = remoteIf(options.sync);
			const [library, cached] = await load(remote, () =>
				Promise.all([readLibrary(remote), key ? readBindings(remote, key) : []])
			);
			const synced = getToken() !== null;

			if (key) {
				let bound = cached;
				let inFolder: string[] = [];

				if (key === here) {
					const root = projectRoot(options.cwd);
					// what is linked here is what agents get, whatever the cache says
					bound = [...new Set([...cached, ...ownedSkills(root)])];
					inFolder = folderSkills(root);
				}

				let rows = resolveProject(library, bound).map((skill) => libraryRow(skill, synced));

				// what sits in the folder is what agents read, even over a library skill
				if (inFolder.length > 0) {
					rows = [
						...rows.filter((row) => !inFolder.includes(row.name)),
						...inFolder.map((name) => folderRow(projectRoot(options.cwd), name))
					].sort((a, b) => a.name.localeCompare(b.name));
				}

				log.info(`Listing skills for ${pc.bold(key)}`);
				log.blank();

				if (rows.length === 0) {
					log.dim('No skills in this project. Run `skilless add <skill>` to add one.');
				} else {
					print(rows, options.details === true);
				}

				remote?.report();
				return;
			}

			log.info('Listing every skill in your library');
			log.blank();

			if (library.entries.length === 0) {
				log.dim('Your library is empty. Run `skilless create <name>` to make one.');
			} else {
				print(
					library.entries.map((skill) => libraryRow(skill, synced)),
					options.details === true
				);
			}

			remote?.report();
		});
	});
