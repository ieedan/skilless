import fs from 'node:fs';
import { Command } from 'commander';
import path from 'pathe';
import { z } from 'zod';
import { SkillessError } from '@/utils/errors';
import * as fsu from '@/utils/fs';
import * as git from '@/utils/git';
import { pushInBackground } from '@/utils/background';
import { readLibrary, refreshGlobals, refreshProject } from '@/utils/library';
import { AGENTS_SKILLS, CLAUDE_SKILLS, userAgentsSkills, userClaudeSkills } from '@/utils/paths';
import { queueBind, queueGlobal } from '@/utils/pending';
import * as project from '@/utils/project';
import { confirm, isInteractive, log, select } from '@/utils/prompts';
import { Remote } from '@/utils/remote';
import { isValidName, readSkill, SKILL_FILE, writeSkill } from '@/utils/skill';
import { readState, writeState } from '@/utils/state';
import { stashFiles } from '@/utils/sync';
import type { LocalSkill, SkillFile } from '@/utils/types';
import { VERSION } from '@/utils/version';
import {
	commonOptions,
	defaultCommandOptionsSchema,
	fetchFiles,
	load,
	parseOptions,
	remoteIf,
	tryCommand,
	settleRefresh,
	tilde
} from './utils';

const schema = defaultCommandOptionsSchema.extend({
	yes: z.boolean(),
	user: z.boolean().optional(),
	includeCommitted: z.boolean().optional(),
	sync: z.boolean().optional()
});

type Scope = 'project' | 'user';

/**
 * What to do with a skill committed to the repo. Moving it untracks it, which
 * removes it for everyone on their next pull; copying leaves the repo alone.
 */
type Committed = 'leave' | 'copy' | 'move';

type Found = {
	name: string;
	dir: string;
	scope: Scope;
	/** Set on a skill committed to the repo, once the user has decided. */
	committed?: Exclude<Committed, 'leave'>;
};

type Migration = {
	skill: LocalSkill;
	/** Every directory it was found in. All of them go once it is in the store. */
	dirs: string[];
	/** Committed directories to untrack from git before they go. */
	untrack: string[];
	/** Committed, and staying that way: saved to your library, never removed or linked here. */
	copyOnly: boolean;
	/** User-level wins: a skill you keep for every project becomes global. */
	scope: Scope;
	/** Already in your library with the same contents, so there is nothing to upload. */
	adopted: boolean;
	/** The losing side of a conflict, kept under `~/.skilless/conflicts` before it is replaced. */
	stash?: { label: 'local' | 'library'; files: SkillFile[] };
};

/** How long ago `time` was, roughly, for choosing between two copies. */
function ago(time: number): string {
	const minutes = Math.max(0, Math.round((Date.now() - time) / 60_000));
	if (minutes < 1) return 'just now';
	if (minutes < 60) return `${minutes} min ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
	const days = Math.round(hours / 24);
	return `${days} day${days === 1 ? '' : 's'} ago`;
}

/**
 * Real skill directories in `dir` — not symlinks, which are either ours already
 * or someone else's arrangement we have no business moving.
 */
function discover(dir: string, scope: Scope): Found[] {
	if (!fsu.exists(dir)) return [];

	return fs
		.readdirSync(dir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
		.map((entry) => ({ name: entry.name, dir: path.join(dir, entry.name), scope }))
		.filter((found) => fsu.exists(path.join(found.dir, SKILL_FILE)));
}

async function decide(name: string, options: z.infer<typeof schema>): Promise<Committed> {
	if (options.includeCommitted) return 'move';

	if (options.yes || !isInteractive) {
		log.warn(
			`Skipped ${name}: it is committed to this repo. Pass --include-committed to move it out of git.`
		);
		return 'leave';
	}

	log.warn(`${name} is committed to this repo.`);
	log.note(
		'Moving it untracks it from git, so teammates lose it on their next pull unless they use skilless.'
	);
	const answer = await select(`What should happen to ${name}?`, [
		{ name: 'leave', message: 'Leave it' },
		{ name: 'copy', message: 'Copy it to my library', hint: 'keep it committed' },
		{ name: 'move', message: 'Move it', hint: 'untrack it from git' }
	]);

	return answer === 'copy' || answer === 'move' ? answer : 'leave';
}

export const migrate = new Command('migrate')
	.description(
		"Move this project's skills into your library and link them back. Offers your user-level skills too, as globals linked back at the user level."
	)
	.argument('[skills...]', 'Skills to migrate, by name. Omit to migrate everything found.')
	.option('--user', 'Migrate your user-level skills too, without asking.')
	.option(
		'--include-committed',
		'Move skills committed to this repo too, without asking. Their removal from git is staged, not committed.'
	)
	.addOption(commonOptions.yes)
	.addOption(commonOptions.sync)
	.addOption(commonOptions.cwd)
	.action(async (wanted: string[], raw) => {
		const options = parseOptions(schema, raw);
		log.intro(VERSION);

		await tryCommand(async () => {
			let remote = remoteIf(options.sync);
			const root = project.projectRoot(options.cwd);
			const key = git.projectKey(options.cwd);

			/* ------------------------------------------------------------ find */

			// naming skills narrows everything below to just them
			const named = (found: Found) => wanted.length === 0 || wanted.includes(found.name);

			const discovered = (
				key
					? [AGENTS_SKILLS, CLAUDE_SKILLS].flatMap((rel) =>
							discover(path.join(root, rel), 'project')
						)
					: []
			).filter(named);

			const inUser = [
				...discover(userClaudeSkills(), 'user'),
				...discover(userAgentsSkills(), 'user')
			].filter(named);

			const missing = wanted.filter(
				(name) => ![...discovered, ...inUser].some((found) => found.name === name)
			);
			if (missing.length > 0) {
				throw new SkillessError(`Nothing to migrate named ${missing.join(', ')}.`, {
					suggestion: key
						? `Migrate looks for real skill directories in ${AGENTS_SKILLS}, ${CLAUDE_SKILLS} and at the user level. Linked ones are already in skilless.`
						: `This directory has no git remote, so only user-level skills can be migrated from it.`
				});
			}

			// committed skills belong to everyone who clones the repo; deleting
			// them here would delete them for the whole team, so only on request
			const isCommitted = (found: Found) => git.isTracked(root, path.relative(root, found.dir));
			const committedNames = [
				...new Set(discovered.filter(isCommitted).map((found) => found.name))
			].sort();
			const decisions = new Map<string, Committed>();
			for (const name of committedNames) decisions.set(name, await decide(name, options));

			const inProject: Found[] = [];
			// already answered for, so they skip the project prompt below
			const picked: Found[] = [];
			for (const found of discovered) {
				const decision = decisions.get(found.name);
				if (!decision) inProject.push(found);
				else if (decision === 'copy') picked.push({ ...found, committed: 'copy' });
				else if (decision === 'move') {
					picked.push(isCommitted(found) ? { ...found, committed: 'move' } : found);
				}
			}

			if (!key) log.dim('No git remote here, so there are no project skills to migrate.');

			if (inProject.length === 0 && picked.length === 0 && inUser.length === 0) {
				log.info('Nothing to migrate.');
				return;
			}

			/* ------------------------------------------------------------ plan */

			const current = await load(remote, () => readLibrary(remote));
			const library = new Map(current.entries.map((e) => [e.name, e]));

			// a skill found at both levels is planned twice; ask about it once
			const resolved = new Map<string, 'library' | 'local' | 'skip'>();

			/**
			 * A different skill of the same name is already in the library, so
			 * one of the two has to win. The other is stashed, never destroyed.
			 */
			const resolve = async (
				skill: LocalSkill,
				copies: Found[]
			): Promise<Pick<Migration, 'skill' | 'adopted' | 'stash'> | null> => {
				const { name } = skill;
				const existing = library.get(name)!;

				let choice = resolved.get(name);
				if (!choice) {
					if (options.yes || !isInteractive) {
						log.warn(
							`Skipped ${name}: a different ${name} is already in your library. Run migrate in a terminal to pick one.`
						);
						choice = 'skip';
					} else {
						const theirs = existing.local?.editedAt ?? existing.remote?.editedAt;
						log.warn(`A different ${name} is already in your library.`);
						log.note(
							`On disk: edited ${ago(skill.editedAt)}, in ${copies.map((copy) => tilde(copy.dir)).join(' and ')}`
						);
						log.note(`In your library: edited ${theirs ? ago(theirs) : 'at an unknown time'}`);
						const answer = await select(`Which ${name} do you want to keep?`, [
							{
								name: 'library',
								message: 'The one in my library',
								hint: 'replaces the copy on disk'
							},
							{
								name: 'local',
								message: 'The one on disk',
								hint: 'replaces it in your library, everywhere'
							},
							{ name: 'skip', message: 'Skip it for now' }
						]);
						choice = answer === 'library' || answer === 'local' ? answer : 'skip';
					}
					resolved.set(name, choice);
				}
				if (choice === 'skip') return null;

				// whichever side loses, the library's files are needed: to keep or to stash
				const files =
					existing.local?.files ??
					(await fetchFiles((remote ??= new Remote()), name, `Fetching ${name} from your library`));
				if (!files) {
					log.warn(`Skipped ${name}: could not fetch the one in your library.`);
					return null;
				}

				if (choice === 'library') {
					const editedAt = existing.local?.editedAt ?? existing.remote!.editedAt;
					return {
						skill: {
							...skill,
							files,
							editedAt,
							contentHash: existing.local?.contentHash ?? existing.remote!.contentHash
						},
						adopted: true,
						stash: { label: 'local', files: skill.files }
					};
				}

				// newer than the library's copy everywhere, so no sync undoes the choice
				return {
					skill: { ...skill, editedAt: Date.now() },
					adopted: false,
					stash: { label: 'library', files }
				};
			};

			const plan = async (found: Found[]): Promise<Migration[]> => {
				const byName = new Map<string, Found[]>();
				for (const f of found) byName.set(f.name, [...(byName.get(f.name) ?? []), f]);

				const migrations: Migration[] = [];

				for (const [name, copies] of [...byName].sort(([a], [b]) => a.localeCompare(b))) {
					if (!isValidName(name)) {
						log.warn(`Skipped ${name}: not a valid skill name.`);
						continue;
					}

					let read: LocalSkill[];
					try {
						read = copies.map((copy) => readSkill(copy.dir, name));
					} catch (e) {
						log.warn(`Skipped ${name}: ${e instanceof Error ? e.message : 'unreadable'}.`);
						continue;
					}

					const skill = read[0];
					if (!skill) continue;

					if (read.some((other) => other.contentHash !== skill.contentHash)) {
						log.warn(
							`Skipped ${name}: found more than one version (${copies.map((c) => c.dir).join(', ')}).`
						);
						continue;
					}

					const existing = library.get(name);
					const theirs = existing?.local?.contentHash ?? existing?.remote?.contentHash;

					const kept =
						theirs && theirs !== skill.contentHash
							? await resolve(skill, copies)
							: { skill, adopted: theirs !== undefined };
					if (!kept) continue;

					migrations.push({
						...kept,
						dirs: copies.filter((copy) => copy.committed !== 'copy').map((copy) => copy.dir),
						untrack: copies.filter((copy) => copy.committed === 'move').map((copy) => copy.dir),
						copyOnly: copies.every((copy) => copy.committed === 'copy'),
						scope: copies.some((copy) => copy.scope === 'user') ? 'user' : 'project'
					});
				}

				return migrations;
			};

			let migrations = await plan(inProject);

			if (migrations.length > 0) {
				log.list(
					`Project skills in ${key}`,
					migrations.map((m) => m.skill.name)
				);
				// naming them was the confirmation
				const ok =
					options.yes ||
					wanted.length > 0 ||
					(await confirm(
						migrations.length === 1
							? 'Move it into skilless and link it here?'
							: `Move these ${migrations.length} into skilless and link them here?`,
						true
					));
				if (!ok) migrations = [];
			}

			migrations.push(...(await plan(picked)));

			if (inUser.length > 0) {
				const names = [...new Set(inUser.map((found) => found.name))].sort();
				log.list('User-level skills', names);

				// never on --yes alone: these reach every project on the machine. Naming
				// one is asking for it, though
				let wantsUser = options.user === true || wanted.length > 0;
				if (!wantsUser && !options.yes && isInteractive) {
					log.note(
						'They would become global skills, linked back into ~/.agents/skills so every project still gets them.'
					);
					wantsUser = await confirm(
						names.length === 1 ? 'Migrate it too?' : `Migrate these ${names.length} too?`,
						false
					);
				}

				if (wantsUser) {
					const taken = new Set(migrations.map((m) => m.skill.name));
					// a skill found at both levels is planned once, from both places
					const both = await plan([
						...inUser,
						...[...inProject, ...picked].filter((found) =>
							inUser.some((u) => u.name === found.name)
						)
					]);
					migrations = [
						...migrations.filter((m) => !both.some((b) => b.skill.name === m.skill.name)),
						...both
					];
					for (const name of taken) {
						if (!migrations.some((m) => m.skill.name === name)) {
							log.warn(`Skipped ${name}: its project and user-level copies differ.`);
						}
					}
				}
			}

			if (migrations.length === 0) {
				log.info('Nothing was migrated.');
				return;
			}

			/* ---------------------------------------------------------- migrate */

			const state = readState();

			const stashed: string[] = [];

			for (const { skill, adopted, stash } of migrations) {
				if (stash) stashed.push(stashFiles(skill.name, stash.label, stash.files));
				writeSkill(skill.name, skill.files, skill.editedAt);
				if (adopted) continue;

				// unknown to state.json, so the background push sends it
				delete state.skills[skill.name];
			}

			writeState(state);

			// only once every skill is safely in the store
			const untracked: string[] = [];
			for (const { dirs, untrack } of migrations) {
				for (const dir of dirs) {
					const rel = path.relative(root, dir);
					if (untrack.includes(dir)) {
						if (!git.untrack(root, rel)) {
							log.warn(`Could not untrack ${rel} from git, so it was left in place.`);
							continue;
						}
						untracked.push(rel);
					}
					fsu.remove(dir);
				}
			}

			const globals = migrations.filter((m) => m.scope === 'user').map((m) => m.skill.name);
			const bound = migrations
				.filter((m) => m.scope === 'project' && !m.copyOnly)
				.map((m) => m.skill.name);

			if (globals.length > 0) queueGlobal(globals, true);
			if (key && bound.length > 0) queueBind(key, bound);
			pushInBackground();

			// a skill already in the library with the same contents was only linked,
			// and saying it was moved in would hide which ones were already there
			const names = (fits: (m: Migration) => boolean) =>
				migrations.filter(fits).map((m) => m.skill.name);
			const report: [string, string[]][] = [
				[
					'Moved into your library and this project',
					names((m) => bound.includes(m.skill.name) && !m.adopted)
				],
				[
					'Already in your library, now linked to this project',
					names((m) => bound.includes(m.skill.name) && m.adopted)
				],
				[
					'Moved into your library as global skills',
					names((m) => m.scope === 'user' && !m.adopted)
				],
				[
					'Already in your library, now linked as global skills',
					names((m) => m.scope === 'user' && m.adopted)
				],
				['Copied into your library, still committed here', names((m) => m.copyOnly && !m.adopted)],
				['Already in your library, still committed here', names((m) => m.copyOnly && m.adopted)]
			];
			for (const [heading, list] of report) if (list.length > 0) log.list(heading, list, true);
			if (stashed.length > 0) {
				log.note('The copies you did not keep are saved here:');
				for (const dir of stashed) log.dim(`    ${tilde(dir)}`);
			}
			if (untracked.length > 0) {
				log.note(
					`Staged the removal of ${untracked.join(', ')} from git. Commit it when you are ready.`
				);
			}

			// the originals are gone, so link everything back — a global lands
			// at the user level, once, right where it was before
			if (key) {
				await settleRefresh(await refreshProject(null, root, key), { yes: options.yes });
			} else if (globals.length > 0) {
				await settleRefresh(await refreshGlobals(null), { yes: options.yes });
			}

			remote?.report();
		});
	});
