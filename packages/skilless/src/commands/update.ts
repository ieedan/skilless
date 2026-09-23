import { Command } from 'commander';
import { z } from 'zod';
import { SkillessError } from '@/utils/errors';
import { normalizeRemote } from '@/utils/git';
import { flush, type LibraryEntry, readLibrary, saveToLibrary } from '@/utils/library';
import { confirm, isInteractive, log, spin } from '@/utils/prompts';
import { Remote } from '@/utils/remote';
import { readSkill } from '@/utils/skill';
import { setSource } from '@/utils/sources';
import { locateSkill, withClone } from '@/utils/source';
import { stashFiles } from '@/utils/sync';
import type { LocalSkill, SkillSource } from '@/utils/types';
import { VERSION } from '@/utils/version';
import { commonOptions, defaultCommandOptionsSchema, parseOptions, tryCommand } from './utils';

const schema = defaultCommandOptionsSchema.extend({
	yes: z.boolean(),
	force: z.boolean()
});

type Tracked = LibraryEntry & { source: SkillSource };

function label(source: SkillSource): string {
	const where = normalizeRemote(source.url) ?? source.url;
	return source.ref ? `${where}#${source.ref}` : where;
}

export const update = new Command('update')
	.description('Update skills added from a git repository to what the repository has now.')
	.argument('[skills...]', 'Skills to update. Omit to update every skill added from a repository.')
	.option('-f, --force', 'Replace skills you have edited too. Your copy is kept first.', false)
	.addOption(commonOptions.yes)
	.addOption(commonOptions.cwd)
	.action(async (names: string[], raw) => {
		const options = parseOptions(schema, raw);
		log.intro(VERSION);

		await tryCommand(async () => {
			const remote = new Remote();
			const library = await spin('Loading your library', async () => {
				await flush(remote);
				return readLibrary(remote);
			});
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
						`${untracked.join(', ')} ${untracked.length === 1 ? 'was' : 'were'} not added from a repository, so there is nothing to update from.`
					);
				}
			}

			const targets = names.length > 0 ? tracked.filter((s) => names.includes(s.name)) : tracked;

			if (targets.length === 0) {
				log.info('None of your skills were added from a repository.');
				log.dim('Run `skilless add owner/repo` to add some.');
				remote.report();
				return;
			}

			// one clone per repo and ref, however many skills came from it
			const groups = new Map<string, Tracked[]>();
			for (const skill of targets) {
				const key = `${skill.source.url}#${skill.source.ref ?? ''}`;
				groups.set(key, [...(groups.get(key) ?? []), skill]);
			}

			const toSave: LocalSkill[] = [];
			const sources = new Map<string, SkillSource>();
			const current: string[] = [];
			const kept: string[] = [];
			const stashed: { name: string; dir: string }[] = [];
			const unreachable: string[] = [];

			for (const group of groups.values()) {
				const source = group[0]!.source;
				const where = label(source);

				// one repo out of reach should not hold up the rest
				const checked = await withClone(
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

							const next: SkillSource = {
								...skill.source,
								path: found.path,
								hash: upstream.contentHash
							};
							const mine = skill.local?.contentHash ?? skill.remote?.contentHash;

							// nothing new upstream, or you already have exactly what it has now
							if (upstream.contentHash === skill.source.hash || mine === upstream.contentHash) {
								setSource(skill.name, next);
								current.push(skill.name);
								continue;
							}

							if (mine !== skill.source.hash) {
								const replace =
									options.force ||
									(isInteractive &&
										!options.yes &&
										(await confirm(
											`You have edited ${skill.name} since it came from ${where}. Replace your edits with what it has now?`
										)));

								if (!replace) {
									kept.push(skill.name);
									continue;
								}

								const files =
									skill.local?.files ??
									(
										await spin(`Fetching your copy of ${skill.name}`, () =>
											remote.try((api) => api.getSkill(skill.name))
										)
									)?.files;

								if (!files) {
									log.warn(
										`Couldn't fetch your copy of ${skill.name} to keep it, so it was left alone.`
									);
									continue;
								}

								stashed.push({ name: skill.name, dir: stashFiles(skill.name, 'update', files) });
							}

							toSave.push(upstream);
							sources.set(skill.name, next);
						}
					},
					{ interactive: isInteractive }
				).then(
					() => true,
					(e: unknown) => {
						if (!(e instanceof SkillessError)) throw e;
						log.warn(e.toString());
						return false;
					}
				);

				if (!checked) unreachable.push(...group.map((skill) => skill.name));
			}

			log.blank();

			const saved = await spin(`Saving ${toSave.length} skill(s) to your library`, () =>
				saveToLibrary(remote, toSave, existing, sources)
			);

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

			remote.report();
		});
	});
