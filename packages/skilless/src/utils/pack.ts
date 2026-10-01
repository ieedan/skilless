import fs from 'node:fs';
import path from 'pathe';
import { addressLabel, addressOf, type Pack, packFile, packSchema, probe } from '@/utils/address';
import { SkillessError } from '@/utils/errors';
import { log } from '@/utils/prompts';
import { assertValidName, readSkill } from '@/utils/skill';
import { discoverSkills, isSource, parseSource, type Source, withClone } from '@/utils/source';
import type { LocalSkill, PackRef, SkillSource } from '@/utils/types';

/*
 * A pack is a JSON file with a `skills` list, each entry somewhere to get
 * skills from — the same strings `skilless add` takes:
 *
 *   {
 *     "name": "Svelte essentials",
 *     "skills": [
 *       "github.com/anthropics/skills",                    every skill in the repo
 *       "github.com/sveltejs/ai-tools/skills#main",        every skill in a folder, pinned
 *       "@ieedan/grill-me",                                one skill on skilless
 *       "@ieedan/pack/svelte-essentials"                   every skill in another pack
 *     ]
 *   }
 *
 * Adding one copies its skills into your library, each remembering the pack.
 * That is how `skilless update` finds the packs you follow, to bring in what
 * they have gained since.
 */

export type LoadedPack = { ref: PackRef; pack: Pack };

/** Where a pack was read from, as it reads in output. */
export function packLabel(ref: PackRef): string {
	return ref.name ?? (/^https?:\/\//i.test(ref.url) ? addressLabel(ref.url) : ref.url);
}

/**
 * True when `arg` names a JSON file on this machine, which can only be a pack.
 * It has to look like a path or end in `.json`, so a skill that happens to share
 * a name with a file in the current directory is still that skill.
 */
export function isPackFile(arg: string): boolean {
	if (!arg.endsWith('.json') && !/[\\/]/.test(arg)) return false;
	try {
		return fs.statSync(arg).isFile();
	} catch {
		return false;
	}
}

export function readPackFile(file: string): LoadedPack {
	const absolute = path.resolve(file);

	let json: unknown;
	try {
		json = JSON.parse(fs.readFileSync(absolute, 'utf8'));
	} catch (cause) {
		throw new SkillessError(`${file} is not JSON.`, {
			suggestion: 'A pack is a JSON file with a `skills` list.',
			cause
		});
	}

	const parsed = packSchema.safeParse(json);
	if (!parsed.success) {
		throw new SkillessError(`${file} is not a pack.`, {
			suggestion: 'A pack is a JSON file with a `skills` list of repositories or addresses.'
		});
	}

	return { ref: { url: absolute, name: parsed.data.name }, pack: parsed.data };
}

/** A pack again, from wherever it was added from — for `update`. */
export async function loadPack(url: string): Promise<LoadedPack> {
	if (!/^https?:\/\//i.test(url)) return readPackFile(url);

	const found = await probe(url);
	if (found?.kind !== 'pack') {
		throw new SkillessError(`${addressLabel(url)} is no longer a pack.`);
	}

	return { ref: { url: found.url, name: found.pack.name }, pack: found.pack };
}

export type Resolved = {
	skill: LocalSkill;
	source: SkillSource;
};

/**
 * What a pack is, however its address was written: a file by its absolute
 * path, a URL with skilless's page addresses read as their JSON, so the same
 * pack reached two ways is recognised as one.
 */
function packId(ref: PackRef): string {
	if (!/^https?:\/\//i.test(ref.url)) return path.resolve(ref.url);
	const url = new URL(ref.url);
	url.pathname = packFile(url.pathname).replace(/\/+$/, '');
	url.hash = '';
	return url.href;
}

/** A pack that leads back into itself. Unlike a dead entry, this stops the whole pack. */
export class PackLoopError extends SkillessError {}

/** A pack entry naming a file, read from beside the pack that names it. */
function nestedFile(entry: string, parent: PackRef): string | null {
	if (/^https?:\/\//i.test(parent.url)) return null;
	if (!entry.endsWith('.json') && !/^\.{0,2}\//.test(entry)) return null;
	const file = path.resolve(path.dirname(parent.url), entry);
	return isPackFile(file) ? file : null;
}

/**
 * Every skill a pack's entries name, fetching each address and cloning each
 * repo once however many entries point into it. A pack inside the pack is
 * followed too, and its skills count as the outer pack's, since that is the
 * one being added; a pack that leads back to one it is already inside is an
 * error, naming the loop. An entry that cannot be resolved is warned about and
 * left out, so one dead link does not sink the rest; `failed` lists them. Two
 * entries giving skills of the same name: the first wins.
 */
export async function resolvePack(
	loaded: LoadedPack,
	/** `intent: 'add'` when adding it, so skilless counts each of its skills and packs as installed. */
	opts: { interactive: boolean; intent?: 'add' }
): Promise<{ skills: Resolved[]; failed: string[]; uncertain: boolean }> {
	/** The pack being added: every skill found, however deep, remembers this one. */
	const origin = loaded.ref;
	const found = new Map<string, Resolved>();
	const failed: string[] = [];
	/**
	 * An entry that might have been a pack could not be read, so what the pack
	 * holds is not fully known: a skill missing from it may only be out of reach.
	 */
	let uncertain = false;

	const take = (resolved: Resolved, entry: string) => {
		const have = found.get(resolved.skill.name);
		if (!have) {
			found.set(resolved.skill.name, resolved);
			return;
		}
		if (have.skill.contentHash !== resolved.skill.contentHash) {
			log.warn(
				`Two skills in ${packLabel(origin)} are called ${resolved.skill.name}. Kept the first, skipped the one from ${entry}.`
			);
		}
	};

	const fail = (entry: string, reason: unknown) => {
		failed.push(entry);
		log.warn(
			`Skipped ${entry}: ${reason instanceof SkillessError ? reason.message : String(reason)}`
		);
	};

	// repositories across every pack, grouped so each is cloned once
	const repos = new Map<string, { source: Source; entries: { entry: string; source: Source }[] }>();
	/** Packs already read in full: reached again by another path, there is nothing new in them. */
	const done = new Set<string>();

	const collect = async (current: LoadedPack, chain: LoadedPack[]): Promise<void> => {
		const id = packId(current.ref);
		const loop = chain.findIndex((outer) => packId(outer.ref) === id);
		if (loop >= 0) {
			const names = [...chain.slice(loop), current].map((p) => packLabel(p.ref));
			throw new PackLoopError(`${packLabel(current.ref)} includes itself: ${names.join(' → ')}`, {
				suggestion: 'Take one of those packs out of the other.'
			});
		}
		if (done.has(id)) return;

		for (const raw of current.pack.skills) {
			const entry = raw.trim();
			if (!entry) continue;

			const maybePack = addressOf(entry) !== null || nestedFile(entry, current.ref) !== null;

			try {
				const file = nestedFile(entry, current.ref);
				if (file) {
					await collect(readPackFile(file), [...chain, current]);
					continue;
				}

				const address = addressOf(entry);
				if (address) {
					const probed = await probe(address, { intent: opts.intent });
					if (probed?.kind === 'pack') {
						await collect({ ref: { url: probed.url, name: probed.pack.name }, pack: probed.pack }, [
							...chain,
							current
						]);
						continue;
					}
					// your own skill is in your library already, and cannot be its own source
					if (probed?.kind === 'skill' && probed.mine) continue;
					if (probed?.kind === 'skill') {
						take(
							{
								skill: probed.skill,
								source: {
									url: probed.url,
									path: '',
									hash: probed.skill.contentHash,
									pack: origin
								}
							},
							entry
						);
						continue;
					}
					// neither: a git server's web page, so a repository after all
				}

				if (!isSource(entry)) {
					fail(entry, new SkillessError('not a repository or an address'));
					continue;
				}

				const source = parseSource(entry);
				const key = `${source.url}#${source.ref ?? ''}`;
				const group = repos.get(key) ?? { source, entries: [] };
				group.entries.push({ entry, source });
				repos.set(key, group);
			} catch (e) {
				// a loop is the pack's fault, not one entry's: it stops the whole thing
				if (e instanceof PackLoopError) throw e;
				if (maybePack) uncertain = true;
				fail(entry, e);
			}
		}

		done.add(id);
	};

	await collect(loaded, []);

	for (const { source, entries } of repos.values()) {
		try {
			await withClone(
				source,
				async (dir) => {
					for (const { entry, source: at } of entries) {
						try {
							let skills = discoverSkills(dir, at.subpath);
							if (at.skill)
								skills = skills.filter((skill) => skill.name === at.skill!.toLowerCase());

							if (skills.length === 0) {
								fail(entry, new SkillessError('no skills there'));
								continue;
							}

							for (const skill of skills) {
								try {
									assertValidName(skill.name);
									const local = readSkill(skill.dir, skill.name);
									take(
										{
											skill: local,
											source: {
												url: source.url,
												...(source.ref ? { ref: source.ref } : {}),
												path: path.relative(dir, skill.dir),
												hash: local.contentHash,
												pack: origin
											}
										},
										entry
									);
								} catch (e) {
									log.warn(`Skipped ${skill.name}: ${e instanceof SkillessError ? e.message : e}`);
								}
							}
						} catch (e) {
							fail(entry, e);
						}
					}
				},
				opts
			);
		} catch (e) {
			if (!(e instanceof SkillessError)) throw e;
			for (const { entry } of entries) {
				// an address that answered nothing, and would not clone either, may have been a pack
				if (addressOf(entry) !== null) uncertain = true;
				fail(entry, e);
			}
		}
	}

	return { skills: [...found.values()], failed, uncertain };
}
