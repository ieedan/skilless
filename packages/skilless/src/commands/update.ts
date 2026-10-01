import { Command } from 'commander';
import { z } from 'zod';
import { addressLabel, addressOf, probe } from '@/utils/address';
import { SkillessError } from '@/utils/errors';
import * as git from '@/utils/git';
import { normalizeRemote } from '@/utils/git';
import { type LibraryEntry, readBindings, readLibrary, saveToLibrary } from '@/utils/library';
import { loadPack, packLabel, type Resolved, resolvePack } from '@/utils/pack';
import { confirm, isInteractive, log, spin } from '@/utils/prompts';
import { Remote } from '@/utils/remote';
import { readSkill } from '@/utils/skill';
import { setSource } from '@/utils/sources';
import { isSource, locateSkill, parseSource, withClone } from '@/utils/source';
import { stashFiles } from '@/utils/sync';
import type { LocalSkill, PackRef, SkillSource } from '@/utils/types';
import { VERSION } from '@/utils/version';
import { bind, setGlobal } from './add';
import { deleteSkills } from './delete';
import {
	commonOptions,
	defaultCommandOptionsSchema,
	fetchFiles,
	load,
	parseOptions,
	remoteIf,
	tryCommand
} from './utils';

const schema = defaultCommandOptionsSchema.extend({
	yes: z.boolean(),
	force: z.boolean(),
	sync: z.boolean().optional()
});

type Tracked = LibraryEntry & { source: SkillSource };

function label(source: SkillSource): string {
	if (addressOf(source.url)) return addressLabel(source.url);
	const where = normalizeRemote(source.url) ?? source.url;
	return source.ref ? `${where}#${source.ref}` : where;
}

/** The source URL a pack entry resolves to, as recorded on its skills, or null when that cannot be told. */
function sourceUrl(entry: string): string | null {
	const address = addressOf(entry);
	if (address) return address;
	try {
		return isSource(entry) ? parseSource(entry).url : null;
	} catch {
		return null;
	}
}

/** What upstream has for a skill now, and the source to record once it is taken. */
type Upstream = { skill: LocalSkill; source: SkillSource };

export const update = new Command('update')
	.description(
		'Update skills added from a repository, an address or a pack to what is there now, and bring in skills the packs you follow have gained.'
	)
	.argument(
		'[skills...]',
		'Skills to update. Omit to update every skill added from elsewhere, and check every pack you follow.'
	)
	.option('-f, --force', 'Replace skills you have edited too. Your copy is kept first.', false)
	.addOption(commonOptions.yes)
	.addOption(commonOptions.sync)
	.addOption(commonOptions.cwd)
	.action(async (names: string[], raw) => {
		const options = parseOptions(schema, raw);
		log.intro(VERSION);

		await tryCommand(async () => {
			let remote = remoteIf(options.sync);
			const library = await load(remote, () => readLibrary(remote));
			const existing = new Map(library.entries.map((skill) => [skill.name, skill]));
			const tracked = library.entries.filter((skill): skill is Tracked => skill.source !== null);

			if (names.length > 0) {
				const unknown = names.filter((name) => !existing.has(name));
				if (unknown.length > 0) {
					throw new SkillessError(`Not in your library: ${unknown.join(', ')}`, {
						suggestion: 'Run `skilless list` to see what you have.'
					});
				}

				const untracked = names.filter((name) => !existing.get(name)?.source);
				if (untracked.length > 0) {
					throw new SkillessError(
						`${untracked.join(', ')} ${untracked.length === 1 ? 'was' : 'were'} not added from anywhere, so there is nothing to update from.`
					);
				}
			}

			const targets = names.length > 0 ? tracked.filter((s) => names.includes(s.name)) : tracked;

			if (targets.length === 0) {
				log.info('None of your skills were added from a repository, an address or a pack.');
				log.dim('Run `skilless add owner/repo` to add some.');
				remote?.report();
				return;
			}

			const toSave: LocalSkill[] = [];
			const sources = new Map<string, SkillSource>();
			const current: string[] = [];
			const kept: string[] = [];
			const stashed: { name: string; dir: string }[] = [];
			const unreachable: string[] = [];

			/**
			 * Takes upstream's copy of a skill, unless you have edited yours since
			 * it last came from there — then only with --force or a yes.
			 */
			const consider = async (skill: Tracked, upstream: Upstream): Promise<void> => {
				const mine = skill.local?.contentHash ?? skill.remote?.contentHash;
				const theirs = upstream.skill.contentHash;
				const where = label(skill.source);

				// nothing new upstream, or you already have exactly what it has now
				if (theirs === skill.source.hash || mine === theirs) {
					setSource(skill.name, upstream.source);
					current.push(skill.name);
					return;
				}

				if (mine !== skill.source.hash) {
					let replace = options.force === true;
					if (!replace && isInteractive && !options.yes) {
						log.note(`You have edited ${skill.name} since it came from ${where}.`);
						replace = await confirm(`Replace your edits to ${skill.name}?`);
					}

					if (!replace) {
						kept.push(skill.name);
						return;
					}

					const files =
						skill.local?.files ??
						(await fetchFiles(
							(remote ??= new Remote()),
							skill.name,
							`Fetching your copy of ${skill.name}`
						));

					if (!files) {
						log.warn(`Couldn't fetch your copy of ${skill.name} to keep it, so it was left alone.`);
						return;
					}

					stashed.push({ name: skill.name, dir: stashFiles(skill.name, 'update', files) });
				}

				toSave.push({ ...upstream.skill, name: skill.name });
				sources.set(skill.name, upstream.source);
			};

			/* ------------------------------------------------------- packs */

			// Every pack something in your library came from is one you follow.
			// Only a full update checks them: naming skills means just those.
			const packs = new Map<string, PackRef>();
			if (names.length === 0) {
				for (const skill of tracked) {
					if (skill.source.pack) packs.set(skill.source.pack.url, skill.source.pack);
				}
			}

			/** Pack members already fetched while resolving their pack, so not cloned twice. */
			const fetched = new Map<string, Upstream>();
			const joined: { pack: PackRef; skills: Resolved[] }[] = [];
			const dropped: { pack: PackRef; skills: Tracked[] }[] = [];

			for (const [url, followed] of packs) {
				const members = tracked.filter((skill) => skill.source.pack?.url === url);

				let resolved: Awaited<ReturnType<typeof resolvePack>>;
				let pack: PackRef;
				try {
					const loaded = await spin(`Checking ${packLabel(followed)}`, () => loadPack(url));
					pack = loaded.ref;
					resolved = await resolvePack(loaded, { interactive: isInteractive });
				} catch (e) {
					if (!(e instanceof SkillessError)) throw e;
					log.warn(`Couldn't check ${packLabel(followed)}: ${e.message}`);
					continue;
				}

				const upstream = new Map(resolved.skills.map((r) => [r.skill.name, r]));

				for (const member of members) {
					const found = upstream.get(member.name);
					if (found) fetched.set(member.name, found);
				}

				const gained = resolved.skills.filter((r) => {
					const have = existing.get(r.skill.name);
					if (!have) return true;
					if (have.source?.pack?.url !== url) {
						log.dim(
							`${r.skill.name} is in ${packLabel(pack)}, but you already have your own, so it was left alone.`
						);
					}
					return false;
				});
				if (gained.length > 0) joined.push({ pack, skills: gained });

				// an entry that could not be reached says nothing about what it holds,
				// so a skill that may have come from one is not taken for dropped — and
				// one that might have been a pack could have held anything
				const unknown = resolved.failed.map(sourceUrl);
				const gone = resolved.uncertain
					? []
					: members.filter(
							(member) =>
								!upstream.has(member.name) &&
								!unknown.some((url) => url === null || url === member.source.url)
						);
				if (gone.length > 0) dropped.push({ pack, skills: gone });
			}

			/* ------------------------------------------------------ skills */

			// one clone per repo and ref, and one fetch per address, however many skills came from it
			const groups = new Map<string, Tracked[]>();
			for (const skill of targets) {
				const found = fetched.get(skill.name);
				if (found) {
					await consider(skill, found);
					continue;
				}

				const key = `${skill.source.url}#${skill.source.ref ?? ''}`;
				groups.set(key, [...(groups.get(key) ?? []), skill]);
			}

			for (const group of groups.values()) {
				const source = group[0]!.source;
				const where = label(source);

				const checked = await (async () => {
					// a skill from an address, fetched rather than cloned
					const address = addressOf(source.url);
					if (address) {
						const found = await spin(`Fetching ${where}`, () => probe(address));
						// a source that is the skill itself, from before that was refused: nothing to take
						if (found?.kind === 'skill' && found.mine) return;
						if (found?.kind === 'skill') {
							for (const skill of group) {
								await consider(skill, {
									skill: found.skill,
									source: { ...skill.source, url: found.url, hash: found.skill.contentHash }
								});
							}
							return;
						}
						if (found?.kind === 'pack') {
							throw new SkillessError(`${where} is a pack now, not a skill.`);
						}
						// neither: a git server's web page, so clone it as before
					}

					await withClone(
						{ url: source.url, ref: source.ref, label: where },
						async (dir) => {
							for (const skill of group) {
								const found = locateSkill(dir, skill.source.path, skill.name);

								if (!found) {
									log.warn(`${skill.name} is no longer in ${where}.`);
									continue;
								}

								let upstream: LocalSkill;
								try {
									upstream = readSkill(found.dir, skill.name);
								} catch (e) {
									log.warn(`Skipped ${skill.name}: ${e instanceof Error ? e.message : e}`);
									continue;
								}

								await consider(skill, {
									skill: upstream,
									source: { ...skill.source, path: found.path, hash: upstream.contentHash }
								});
							}
						},
						{ interactive: isInteractive }
					);
				})().then(
					() => true,
					// one source out of reach should not hold up the rest
					(e: unknown) => {
						if (!(e instanceof SkillessError)) throw e;
						log.warn(e.toString());
						return false;
					}
				);

				if (!checked) unreachable.push(...group.map((skill) => skill.name));
			}

			log.blank();

			const saved = saveToLibrary(toSave, existing, sources);

			for (const name of saved) {
				log.step(`Updated ${name}.`);
			}

			if (current.length > 0) {
				log.info(
					current.length === 1
						? `${current[0]} is already up to date.`
						: `${current.length} skills are already up to date.`
				);
			}

			if (kept.length > 0) {
				log.warn(
					`Kept your edits to ${kept.join(', ')}. Run \`skilless update ${kept.join(' ')} --force\` to replace them.`
				);
			}

			if (unreachable.length > 0) {
				log.warn(`Couldn't check ${unreachable.join(', ')}.`);
			}

			if (stashed.length > 0) {
				log.blank();
				log.dim('Your edited copies are kept here:');
				for (const stash of stashed) log.dim(`  ${stash.dir}`);
			}

			/* ------------------------------------------ what packs gained */

			for (const { pack, skills } of joined) {
				await join(pack, skills, tracked, existing, options);
			}

			/* ------------------------------------------- what packs dropped */

			for (const { pack, skills } of dropped) {
				for (const skill of skills) {
					const where = packLabel(pack);

					if (!isInteractive || options.yes) {
						log.warn(
							`${skill.name} is no longer in ${where}. Run \`skilless delete ${skill.name}\` to delete it.`
						);
						continue;
					}

					if (
						await confirm(`${skill.name} is no longer in ${where}. Delete it from your library?`)
					) {
						deleteSkills([skill.name], options.cwd);
						continue;
					}

					// yours now: it no longer follows the pack, so this is not asked again
					const rest = { ...skill.source };
					delete rest.pack;
					setSource(skill.name, rest);
					log.dim(`Kept ${skill.name}. It no longer comes from ${where}.`);
				}
			}

			remote?.report();
		});
	});

/**
 * Brings in the skills a pack has gained, and puts them where the pack's other
 * skills already are: global if those are, or in this project if it has them.
 * Anywhere else they wait in your library to be added.
 */
async function join(
	pack: PackRef,
	skills: Resolved[],
	tracked: Tracked[],
	existing: Map<string, LibraryEntry>,
	options: { cwd: string; yes: boolean }
): Promise<void> {
	const where = packLabel(pack);
	const names = saveToLibrary(
		skills.map((r) => r.skill),
		existing,
		new Map(skills.map((r) => [r.skill.name, r.source]))
	);

	log.blank();
	for (const name of names) log.step(`Copied ${name} into your library, new in ${where}.`);

	const members = tracked.filter((skill) => skill.source.pack?.url === pack.url);
	const link = { cwd: options.cwd, yes: options.yes };

	if (members.some((skill) => skill.global)) {
		await setGlobal(names, true, link);
		return;
	}

	const key = git.projectKey(options.cwd);
	const bound = key ? await readBindings(null, key) : [];

	if (key && members.some((skill) => bound.includes(skill.name))) {
		const library = await readLibrary(null);
		const globals = library.entries.filter((skill) => skill.global).map((skill) => skill.name);
		await bind(key, names, globals, link);
		return;
	}

	log.dim(
		`Run \`skilless add ${names.join(' ')}\` in a project that uses ${where} to add ${names.length === 1 ? 'it' : 'them'} there.`
	);
}
