import { Command } from 'commander';
import path from 'pathe';
import { z } from 'zod';
import { SkillessError } from '@/utils/errors';
import * as git from '@/utils/git';
import {
	fetchMissing,
	type LibraryEntry,
	readBindings,
	readLibrary,
	refreshGlobals,
	refreshProject,
	saveToLibrary
} from '@/utils/library';
import { pushInBackground } from '@/utils/background';
import { queueBind, queueGlobal } from '@/utils/pending';
import * as project from '@/utils/project';
import { confirm, isInteractive, log, multiselect, spin } from '@/utils/prompts';
import { Remote } from '@/utils/remote';
import { assertValidName, readSkill } from '@/utils/skill';
import { addressLabel, addressOf, probe } from '@/utils/address';
import {
	isPackFile,
	type LoadedPack,
	packLabel,
	readPackFile,
	type Resolved,
	resolvePack
} from '@/utils/pack';
import { discoverSkills, isSource, parseSource, type Source, withClone } from '@/utils/source';
import { setSource } from '@/utils/sources';
import type { LocalSkill, SkillSource } from '@/utils/types';
import { VERSION } from '@/utils/version';
import {
	commonOptions,
	defaultCommandOptionsSchema,
	load,
	parseOptions,
	remoteIf,
	requireProjectKey,
	skillChoices,
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
	sync: z.boolean().optional(),
	yes: z.boolean()
});

type Options = z.infer<typeof schema>;

/** What linking needs, so `update` can link the skills a pack gains the same way. */
type LinkOptions = Pick<Options, 'copy' | 'cwd' | 'project' | 'yes'>;

export const add = new Command('add')
	.description(
		'Add skills to this project: from your library, a git repository, a skilless address, or a pack.'
	)
	.argument(
		'[skills...]',
		'Skills to add; or a repo (`owner/repo` or any git URL) then the skills to take from it; or a skill or pack address (`skilless.dev/skills/<id>`, `skilless.dev/packs/<id>`, any URL serving a pack, or a pack file). Omit the skills to pick from a list.'
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
	.addOption(commonOptions.sync)
	.addOption(commonOptions.cwd)
	.action(async (names: string[], raw) => {
		const options = parseOptions(schema, raw);
		log.intro(VERSION);

		await tryCommand(async () => {
			let remote = remoteIf(options.sync);

			const [first, ...rest] = names;

			if (first && (isPackFile(first) || isSource(first))) {
				await addFrom(remote, first, rest, options);
				return;
			}

			const misplaced = names.find(isSource);
			if (misplaced) {
				throw new SkillessError(`${misplaced} is a repository, not a skill.`, {
					suggestion: `Name the repository first: \`skilless add ${misplaced} <skills...>\`.`
				});
			}

			// the project's skills only matter when adding to one, but are read
			// alongside the library rather than after it
			const projectKey =
				options.global || options.notGlobal
					? null
					: (options.project ?? git.projectKey(options.cwd));

			const [{ entries: library }, boundNames] = await load(remote, () =>
				Promise.all([readLibrary(remote), projectKey ? readBindings(remote, projectKey) : []])
			);

			// a skill your library has that is not on disk yet is fetched to be linked
			const ensureLocal = async (selected: string[]) => {
				const absent = library
					.filter((skill) => selected.includes(skill.name) && skill.local === null)
					.map((skill) => skill.name);
				if (absent.length === 0) return;

				const server = (remote ??= new Remote());
				const failed = await spin('Fetching from skilless.dev', () => fetchMissing(server, absent));

				if (failed.length > 0) {
					throw new SkillessError(`Couldn't fetch ${failed.join(', ')} from skilless.dev.`, {
						suggestion: 'Check your connection, then try again.'
					});
				}
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
						skillChoices(candidates.map((entry) => ({ entry })))
					);

					if (selected.length === 0) {
						log.info('Nothing selected.');
						return;
					}
				}

				if (value) await ensureLocal(selected);

				await setGlobal(selected, value, options);
				remote?.report();
				return;
			}

			/* ----------------------------------------------------------- project */

			const key = requireProjectKey(options.cwd, projectKey ?? undefined);
			const bound = new Set(boundNames);

			let selected = names;

			if (selected.length === 0) {
				// globals are already in every project, so there is nothing to add
				const available = library.filter((skill) => !bound.has(skill.name) && !skill.global);

				if (available.length === 0) {
					log.info('Every skill in your library is already in this project.');
					remote?.report();
					return;
				}

				// already-added skills stay in the list, so it is clear they were not lost.
				// Globals are in every project already, so they would only be noise
				selected = await multiselect(
					`Add to ${key}`,
					skillChoices(
						library
							.filter((entry) => !entry.global)
							.map((entry) =>
								bound.has(entry.name) ? { entry, disabled: 'already added' } : { entry }
							)
					)
				);

				if (selected.length === 0) {
					log.info('Nothing selected.');
					return;
				}
			}

			const globals = library.filter((skill) => skill.global).map((skill) => skill.name);
			await ensureLocal(selected.filter((name) => !globals.includes(name)));

			await bind(key, selected, globals, options);
			remote?.report();
		});
	});

/**
 * Marks skills global, or not, and moves their links to match: a global skill
 * lives once at the user level (`~/.agents/skills`, `~/.claude/skills`) rather
 * than in every project that uses it.
 */
export async function setGlobal(
	names: string[],
	value: boolean,
	options: LinkOptions
): Promise<void> {
	queueGlobal(names, value);
	pushInBackground();

	for (const name of names) {
		log.step(
			value ? `${name} is now global, so every project has it.` : `${name} is no longer global.`
		);
	}

	const key = options.project ?? git.projectKey(options.cwd);
	const root = project.projectRoot(options.cwd);

	const [result, user] = await (async () => {
		if (!key) {
			const user = await refreshGlobals(null);
			return [user, user] as const;
		}

		const result = await refreshProject(null, root, key, { copy: options.copy });
		return [result, result.user] as const;
	})();

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
export async function bind(
	key: string,
	names: string[],
	globals: string[],
	options: LinkOptions
): Promise<void> {
	// globals are already in every project, so binding them would be a no-op
	for (const name of names) {
		if (globals.includes(name)) log.dim(`${name} is global, so it is already in this project.`);
	}

	const toBind = names.filter((name) => !globals.includes(name));

	queueBind(key, toBind);
	pushInBackground();

	const root = project.projectRoot(options.cwd);
	const installed = await refreshProject(null, root, key, { copy: options.copy });

	for (const name of toBind) log.step(`Added ${name} to this project.`);

	await settleRefresh(installed, options);
}

/**
 * `skilless add owner/repo`: clone the repo, pick skills out of it, copy them
 * into your library, then add them the same way as any library skill. Each
 * one remembers the repo it came from, so `skilless update` can refresh it.
 */
async function addFromSource(
	remote: Remote | null,
	source: Source,
	wanted: string[],
	options: Options
): Promise<void> {
	if (options.notGlobal) {
		throw new SkillessError('--not-global only applies to skills already in your library.');
	}

	// resolve this before cloning, so a bad --project fails fast
	const key = options.global ? null : (options.project ?? git.projectKey(options.cwd));

	const library = await load(remote, () => readLibrary(remote));
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
		remote?.report();
		return;
	}

	const resolved = chosen.map(({ skill, path: at }) => ({
		skill,
		source: {
			url: source.url,
			...(source.ref ? { ref: source.ref } : {}),
			path: at,
			hash: skill.contentHash
		}
	}));

	await adopt(remote, resolved, source.label, existing, key, options);
}

/**
 * Anything named by where it is rather than by name: a pack file, a pack or
 * skill at an address, or — failing both — a git repository.
 */
async function addFrom(
	remote: Remote | null,
	arg: string,
	wanted: string[],
	options: Options
): Promise<void> {
	const whole = (what: string) => {
		if (wanted.length > 0) {
			throw new SkillessError(`${what} is added whole, so it takes no skill names after it.`, {
				suggestion: 'Add it, then `skilless remove` any skills you do not want in this project.'
			});
		}
	};

	if (isPackFile(arg)) {
		whole('A pack');
		await addFromPack(remote, readPackFile(arg), options);
		return;
	}

	const address = addressOf(arg);
	if (address) {
		const found = await spin(`Fetching ${addressLabel(address)}`, () =>
			probe(address, { intent: 'add' })
		);

		if (found?.kind === 'pack') {
			whole('A pack');
			await addFromPack(
				remote,
				{ ref: { url: found.url, name: found.pack.name }, pack: found.pack },
				options
			);
			return;
		}

		if (found?.kind === 'skill') {
			whole('A skill address');
			if (found.mine) {
				throw new SkillessError(
					`${found.skill.name} is your own skill, so it is in your library already.`,
					{
						suggestion: `Run \`skilless add ${found.skill.name}\` to add it to this project.`
					}
				);
			}
			if (options.notGlobal) {
				throw new SkillessError('--not-global only applies to skills already in your library.');
			}

			const key = options.global ? null : (options.project ?? git.projectKey(options.cwd));
			const library = await load(remote, () => readLibrary(remote));
			const existing = new Map(library.entries.map((skill) => [skill.name, skill]));
			const resolved = {
				skill: found.skill,
				source: { url: found.url, path: '', hash: found.skill.contentHash }
			};

			await adopt(remote, [resolved], addressLabel(found.url), existing, key, options);
			return;
		}
	}

	await addFromSource(remote, parseSource(arg), wanted, options);
}

/**
 * `skilless add <pack>`: every skill the pack names, copied into your library
 * and added the same way as any library skill. Each one remembers the pack, so
 * `skilless update` can bring in what it gains later.
 */
async function addFromPack(
	remote: Remote | null,
	loaded: LoadedPack,
	options: Options
): Promise<void> {
	if (options.notGlobal) {
		throw new SkillessError('--not-global only applies to skills already in your library.');
	}

	const label = packLabel(loaded.ref);
	const key = options.global ? null : (options.project ?? git.projectKey(options.cwd));

	if (loaded.pack.skills.length === 0) {
		log.info(`${label} is empty.`);
		return;
	}

	const library = await load(remote, () => readLibrary(remote));
	const existing = new Map(library.entries.map((skill) => [skill.name, skill]));

	const { skills } = await resolvePack(loaded, { interactive: isInteractive, intent: 'add' });

	if (skills.length === 0) {
		throw new SkillessError(`Nothing in ${label} could be added.`);
	}

	await adopt(remote, skills, label, existing, key, options);
}

/**
 * Copies skills from somewhere else into your library — asking before
 * replacing one you have that differs — records where each came from, then
 * adds them to the project, or makes them global, like any library skill.
 */
async function adopt(
	remote: Remote | null,
	resolved: Resolved[],
	from: string,
	existing: Map<string, LibraryEntry>,
	key: string | null,
	options: Options
): Promise<void> {
	const toSave: LocalSkill[] = [];
	const names: string[] = [];
	const sources = new Map<string, SkillSource>();

	for (const { skill, source } of resolved) {
		sources.set(skill.name, source);

		const have = existing.get(skill.name);
		const hash = have?.local?.contentHash ?? have?.remote?.contentHash;

		if (!have || hash === skill.contentHash) {
			// the same files are already yours, so they are this source's copy too
			if (have) setSource(skill.name, source);
			else toSave.push(skill);

			names.push(skill.name);
			continue;
		}

		const replace =
			options.overwrite ||
			(isInteractive &&
				!options.yes &&
				(await confirm(
					`${skill.name} is already in your library. Replace it with the one from ${from}?`
				)));

		if (!replace) {
			log.warn(`Kept your own ${skill.name}. Pass --overwrite to replace it.`);
			continue;
		}

		toSave.push(skill);
		names.push(skill.name);
	}

	const saved = saveToLibrary(toSave, existing, sources);

	for (const name of saved) {
		log.step(`Copied ${name} into your library from ${from}.`);
	}

	if (names.length === 0) {
		remote?.report();
		return;
	}

	if (options.global) {
		await setGlobal(names, true, options);
	} else if (key) {
		const library = await readLibrary(null);
		const globals = library.entries.filter((skill) => skill.global).map((skill) => skill.name);
		await bind(key, names, globals, options);
	} else {
		log.blank();
		log.dim(
			`This directory has no git remote, so ${names.length === 1 ? 'it is' : 'they are'} only in your library. Run \`skilless add ${names[0]}\` inside a project to add ${names.length === 1 ? 'it' : 'them'} there.`
		);
	}

	remote?.report();
}

/** A description short enough to sit beside a name in a list. */
function hint(description: string | undefined): string | undefined {
	if (!description) return undefined;
	return description.length > 60 ? `${description.slice(0, 57)}...` : description;
}
