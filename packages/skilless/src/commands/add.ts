import { Command } from 'commander';
import path from 'pathe';
import { z } from 'zod';
import { SkillessError } from '@/utils/errors';
import * as git from '@/utils/git';
import {
	flush,
	type LibraryEntry,
	readBindings,
	readLibrary,
	refreshGlobals,
	refreshProject,
	saveToLibrary
} from '@/utils/library';
import { queueBind, queueGlobal } from '@/utils/pending';
import * as project from '@/utils/project';
import { confirm, isInteractive, log, multiselect, spin } from '@/utils/prompts';
import { Remote } from '@/utils/remote';
import { assertValidName, readSkill } from '@/utils/skill';
import { discoverSkills, isSource, parseSource, type Source, withClone } from '@/utils/source';
import { setSource } from '@/utils/sources';
import type { LocalSkill, SkillSource } from '@/utils/types';
import { VERSION } from '@/utils/version';
import {
	commonOptions,
	defaultCommandOptionsSchema,
	parseOptions,
	requireProjectKey,
	tryCommand,
	USER_SKILLS,
	settleRefresh
} from './utils';

const schema = defaultCommandOptionsSchema.extend({
	project: z.string().optional(),
	copy: z.boolean().optional(),
	global: z.boolean().optional(),
	notGlobal: z.boolean().optional(),
	overwrite: z.boolean(),
	yes: z.boolean()
});

type Options = z.infer<typeof schema>;

export const add = new Command('add')
	.description('Add skills to this project, from your library or from a git repository.')
	.argument(
		'[skills...]',
		'Skills to add, or a repo (`owner/repo` or any git URL) then the skills to take from it. Omit the skills to pick from a list.'
	)
	.option(
		'-g, --global',
		'Make these skills global: linked once into ~/.agents/skills and ~/.claude/skills, so every project has them, including cloud agents.'
	)
	.option(
		'--not-global',
		'Stop treating these skills as global, and unlink them from your user-level skills.'
	)
	.option('--copy', 'Write real files instead of symlinking into the store.')
	.option('--overwrite', 'From a repo: replace library skills of the same name.', false)
	.addOption(commonOptions.yes)
	.addOption(commonOptions.project)
	.addOption(commonOptions.cwd)
	.action(async (names: string[], raw) => {
		const options = parseOptions(schema, raw);
		log.intro(VERSION);

		await tryCommand(async () => {
			const remote = new Remote();

			const [first, ...rest] = names;

			if (first && isSource(first)) {
				await addFromSource(remote, parseSource(first), rest, options);
				return;
			}

			const misplaced = names.find(isSource);
			if (misplaced) {
				throw new SkillessError(`${misplaced} is a repository, not a skill.`, {
					suggestion: `Name the repository first: \`skilless add ${misplaced} <skills...>\`.`
				});
			}

			const { entries: library, live } = await spin('Loading your library', async () => {
				await flush(remote);
				return readLibrary(remote);
			});

			// without the server, a skill that is not on disk has nothing to link
			const linkable = (skill: LibraryEntry) => live || skill.local !== null;
			const assertLinkable = (selected: string[]) => {
				const missing = library
					.filter((skill) => selected.includes(skill.name) && !linkable(skill))
					.map((skill) => skill.name);

				if (missing.length === 0) return;

				throw new SkillessError(
					`${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not on this machine, and the server can't be reached to fetch ${missing.length === 1 ? 'it' : 'them'}.`,
					{ suggestion: 'Run `skilless sync` once you are back online, then try again.' }
				);
			};

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
					const candidates = library.filter(
						(skill) => skill.global !== value && (!value || linkable(skill))
					);

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

				if (value) assertLinkable(selected);

				await setGlobal(remote, selected, value, options);
				remote.report();
				return;
			}

			/* ----------------------------------------------------------- project */

			const key = requireProjectKey(options.cwd, options.project);
			const bound = new Set(await spin(`Loading ${key}`, () => readBindings(remote, key)));

			let selected = names;

			if (selected.length === 0) {
				const available = library.filter((skill) => !bound.has(skill.name) && linkable(skill));

				if (available.length === 0) {
					log.info(
						live
							? 'Every skill in your library is already in this project.'
							: 'Every skill on this machine is already in this project.'
					);
					remote.report();
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

			const globals = library.filter((skill) => skill.global).map((skill) => skill.name);
			assertLinkable(selected.filter((name) => !globals.includes(name)));

			await bind(remote, key, selected, globals, options);
			remote.report();
		});
	});

/**
 * Marks skills global, or not, and moves their links to match: a global skill
 * lives once at the user level (`~/.agents/skills`, `~/.claude/skills`) rather
 * than in every project that uses it.
 */
async function setGlobal(
	remote: Remote,
	names: string[],
	value: boolean,
	options: Options
): Promise<void> {
	queueGlobal(names, value);
	await spin('Saving to skilless.dev', () => flush(remote));

	for (const name of names) {
		log.step(
			value ? `${name} is now global, so every project has it.` : `${name} is no longer global.`
		);
	}

	const key = options.project ?? git.projectKey(options.cwd);
	const root = project.projectRoot(options.cwd);

	const [result, user] = await spin('Updating your skills', async () => {
		if (!key) {
			const user = await refreshGlobals(remote);
			return [user, user] as const;
		}

		const result = await refreshProject(remote, root, key, { copy: options.copy });
		return [result, result.user] as const;
	});

	for (const name of user.written.filter((name) => names.includes(name)))
		log.dim(`Linked ${name} into ${USER_SKILLS}.`);
	for (const name of user.removed) log.dim(`Unlinked ${name} from ${USER_SKILLS}.`);

	if ('project' in result) {
		for (const name of result.project.removed) log.dim(`Moved ${name} out of this project.`);
		for (const name of result.project.written.filter((name) => names.includes(name)))
			log.dim(`${name} is still added to this project, so it is linked here again.`);
	}

	await settleRefresh(result, options);
}

/** Binds skills to a project and links them in. */
async function bind(
	remote: Remote,
	key: string,
	names: string[],
	globals: string[],
	options: Options
): Promise<void> {
	// globals are already in every project, so binding them would be a no-op
	for (const name of names) {
		if (globals.includes(name)) log.dim(`${name} is global, so it is already in this project.`);
	}

	const toBind = names.filter((name) => !globals.includes(name));

	queueBind(key, toBind);

	const root = project.projectRoot(options.cwd);
	const installed = await spin('Updating this project', async () => {
		await flush(remote);
		return refreshProject(remote, root, key, { copy: options.copy });
	});

	for (const name of toBind) log.step(`Added ${name} to this project.`);

	await settleRefresh(installed, options);
}

/**
 * `skilless add owner/repo`: clone the repo, pick skills out of it, copy them
 * into your library, then add them the same way as any library skill. Each
 * one remembers the repo it came from, so `skilless update` can refresh it.
 */
async function addFromSource(
	remote: Remote,
	source: Source,
	wanted: string[],
	options: Options
): Promise<void> {
	if (options.notGlobal) {
		throw new SkillessError('--not-global only applies to skills already in your library.');
	}

	// resolve this before cloning, so a bad --project fails fast
	const key = options.global ? null : (options.project ?? git.projectKey(options.cwd));

	const library = await spin('Loading your library', async () => {
		await flush(remote);
		return readLibrary(remote);
	});
	const existing = new Map(library.entries.map((skill) => [skill.name, skill]));

	const requested = [...wanted, ...(source.skill ? [source.skill] : [])];

	const chosen = await withClone(
		source,
		async (dir) => {
			const found = discoverSkills(dir, source.subpath);

			if (found.length === 0) {
				throw new SkillessError(`No skills found in ${source.label}.`, {
					suggestion: 'A skill is a directory containing a SKILL.md.'
				});
			}

			let picked = found;

			if (requested.length > 0) {
				const lookup = (name: string) =>
					found.find(
						(skill) =>
							skill.name === name.toLowerCase() ||
							skill.dir.split('/').at(-1)?.toLowerCase() === name.toLowerCase()
					);
				const unknown = requested.filter((name) => !lookup(name));

				if (unknown.length > 0) {
					throw new SkillessError(`Not in ${source.label}: ${unknown.join(', ')}`, {
						suggestion: `It has: ${found.map((skill) => skill.name).join(', ')}`
					});
				}

				picked = [...new Set(requested.map((name) => lookup(name)!))];
			} else if (found.length > 1 && !options.yes) {
				if (!isInteractive) {
					throw new SkillessError(`${source.label} has ${found.length} skills.`, {
						suggestion: `Name the ones you want after the repository, or pass --yes for all of them: ${found.map((skill) => skill.name).join(', ')}`
					});
				}

				const names = await multiselect(
					`Add from ${source.label}`,
					found.map((skill) => ({ name: skill.name, hint: hint(skill.description) }))
				);
				picked = found.filter((skill) => names.includes(skill.name));
			}

			// read the files now — the clone is gone once this returns
			const skills: { skill: LocalSkill; path: string }[] = [];

			for (const skill of picked) {
				try {
					assertValidName(skill.name);
					skills.push({
						skill: readSkill(skill.dir, skill.name),
						path: path.relative(dir, skill.dir)
					});
				} catch (e) {
					log.warn(`Skipped ${skill.name}: ${e instanceof SkillessError ? e.message : e}`);
				}
			}

			return skills;
		},
		{ interactive: isInteractive }
	);

	if (chosen.length === 0) {
		log.info('Nothing selected.');
		remote.report();
		return;
	}

	const toSave: LocalSkill[] = [];
	const names: string[] = [];
	const sources = new Map<string, SkillSource>();

	for (const { skill, path: at } of chosen) {
		sources.set(skill.name, {
			url: source.url,
			...(source.ref ? { ref: source.ref } : {}),
			path: at,
			hash: skill.contentHash
		});

		const have = existing.get(skill.name);
		const hash = have?.local?.contentHash ?? have?.remote?.contentHash;

		if (!have || hash === skill.contentHash) {
			// the same files are already yours, so they are the repo's copy too
			if (have) setSource(skill.name, sources.get(skill.name)!);
			else toSave.push(skill);

			names.push(skill.name);
			continue;
		}

		const replace =
			options.overwrite ||
			(isInteractive &&
				!options.yes &&
				(await confirm(
					`${skill.name} is already in your library. Replace it with the one from ${source.label}?`
				)));

		if (!replace) {
			log.warn(`Kept your own ${skill.name}. Pass --overwrite to replace it.`);
			continue;
		}

		toSave.push(skill);
		names.push(skill.name);
	}

	const saved = await spin(`Saving ${toSave.length} skill(s) to your library`, () =>
		saveToLibrary(remote, toSave, existing, sources)
	);

	for (const name of saved) {
		log.step(`Copied ${name} into your library from ${source.label}.`);
	}

	if (names.length === 0) {
		remote.report();
		return;
	}

	if (options.global) {
		await setGlobal(remote, names, true, options);
	} else if (key) {
		const library = await spin('Loading your library', () => readLibrary(remote));
		const globals = library.entries.filter((skill) => skill.global).map((skill) => skill.name);
		await bind(remote, key, names, globals, options);
	} else {
		log.blank();
		log.dim(
			`This directory has no git remote, so ${names.length === 1 ? 'it is' : 'they are'} only in your library. Run \`skilless add ${names[0]}\` inside a project to add ${names.length === 1 ? 'it' : 'them'} there.`
		);
	}

	remote.report();
}

/** A description short enough to sit beside a name in a list. */
function hint(description: string | undefined): string | undefined {
	if (!description) return undefined;
	return description.length > 60 ? `${description.slice(0, 57)}...` : description;
}
