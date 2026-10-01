import { Command } from 'commander';
import pc from 'picocolors';
import { z } from 'zod';
import type { ApiClient, RemotePack } from '@/utils/api';
import { getApiUrl } from '@/utils/auth';
import { SkillessError } from '@/utils/errors';
import { confirm, isInteractive, log, multiselect, spin } from '@/utils/prompts';
import { isSource } from '@/utils/source';
import { VERSION } from '@/utils/version';
import {
	commonOptions,
	defaultCommandOptionsSchema,
	parseOptions,
	requireApi,
	tryCommand
} from './utils';

/*
 * Your packs on skilless.dev, from the terminal. Adding one is `skilless add
 * <pack url>`, like any pack; these are for making and keeping them.
 */

const PUBLIC = '⊕';
const PRIVATE = '◌';

function count(pack: RemotePack): string {
	const n = pack.skillCount;
	return `${n}${pack.countPartial && n > 0 ? '+' : ''} ${n === 1 && !pack.countPartial ? 'skill' : 'skills'}`;
}

/** The address as `skilless add` reads it: no `https://`, which it assumes. */
function short(url: string): string {
	return url.replace(/^https:\/\//, '');
}

/**
 * The packs `ref` names: an id, a pack URL ending in one, or a name, matched
 * without regard to case. A name two packs share is refused rather than guessed.
 */
function find(packs: RemotePack[], ref: string): RemotePack {
	const id = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(\.json)?\/?$/i
		.exec(ref)?.[1]
		?.toLowerCase();
	if (id) {
		const byId = packs.find((pack) => pack.id === id);
		if (byId) return byId;
		throw new SkillessError(`You have no pack with id ${id}.`, {
			suggestion: 'Run `skilless packs list` to see yours.'
		});
	}

	const named = packs.filter((pack) => pack.name.toLowerCase() === ref.trim().toLowerCase());
	if (named.length === 1) return named[0]!;

	if (named.length > 1) {
		throw new SkillessError(`You have ${named.length} packs called ${ref}.`, {
			suggestion: `Name one by its id: ${named.map((pack) => pack.id).join(', ')}`
		});
	}

	throw new SkillessError(`You have no pack called ${ref}.`, {
		suggestion: 'Run `skilless packs list` to see yours.'
	});
}

/**
 * A pack entry for each source given: a library skill by name becomes its
 * skilless address; anything else — a repo, a folder in one, an address — is
 * an entry as written, for the server to check.
 */
async function toEntries(api: ApiClient, sources: string[]): Promise<string[]> {
	const names = sources.filter((source) => !isSource(source));
	if (names.length === 0) return sources;

	const library = await api.listSkills();
	const missing: string[] = [];
	const unaddressed: string[] = [];

	const entries = sources.map((source) => {
		if (isSource(source)) return source;

		const skill = library.find((candidate) => candidate.name === source);
		if (!skill) missing.push(source);
		else if (!skill.id) unaddressed.push(source);
		return skill?.id ? `${getApiUrl()}/skills/${skill.id}` : source;
	});

	if (missing.length > 0) {
		throw new SkillessError(`Not in your library on skilless.dev: ${missing.join(', ')}`, {
			suggestion: 'Run `skilless sync` first if you created them on this machine.'
		});
	}
	if (unaddressed.length > 0) {
		throw new SkillessError(
			`${unaddressed.join(', ')} ${unaddressed.length === 1 ? 'has' : 'have'} no address yet.`,
			{
				suggestion: 'Try again shortly, or add it from the Packs page on skilless.dev.'
			}
		);
	}

	return entries;
}

/* ------------------------------------------------------------------- list */

const list = new Command('list')
	.description('List your packs.')
	.addOption(commonOptions.cwd)
	.action(async (raw) => {
		parseOptions(defaultCommandOptionsSchema, raw);
		log.intro(VERSION);

		await tryCommand(async () => {
			const api = requireApi();
			const packs = await spin('Checking skilless.dev', () => api.listPacks());

			if (packs.length === 0) {
				log.dim('You have no packs. Run `skilless packs create <name>` to make one.');
				return;
			}

			log.info('Listing your packs');
			log.blank();

			const width = Math.max(...packs.map((pack) => pack.name.length)) + 2;
			for (const pack of packs) {
				const icon = pack.public ? PUBLIC : PRIVATE;
				const details = [count(pack), pack.public ? 'public' : 'private'].join(' · ');
				log.raw(`  ${pack.name.padEnd(width)}${icon} ${pc.gray(details)}`);
				log.raw(`  ${' '.repeat(width + 2)}${pc.gray(short(pack.url))}`);
			}
		});
	});

/* ----------------------------------------------------------------- create */

const createSchema = defaultCommandOptionsSchema.extend({
	description: z.string().optional(),
	public: z.boolean()
});

const create = new Command('create')
	.description('Create a pack, optionally with skills in it.')
	.argument('<name>', 'What the pack is called.')
	.argument(
		'[skills...]',
		'Skills to put in it: library skills by name, repos (`github.com/owner/repo[/path][#ref]`), or skill addresses.'
	)
	.option('-d, --description <text>', 'What it is for.')
	.option(
		'--public',
		'Let anyone with the address see and add it. Packs are private otherwise.',
		false
	)
	.addOption(commonOptions.cwd)
	.action(async (name: string, sources: string[], raw) => {
		const options = parseOptions(createSchema, raw);
		log.intro(VERSION);

		await tryCommand(async () => {
			const api = requireApi();

			const pack = await spin('Creating the pack on skilless.dev', async () =>
				api.createPack({
					name,
					description: options.description,
					skills: await toEntries(api, sources),
					public: options.public
				})
			);

			log.step(`Created ${pack.name}, ${pack.public ? 'public' : 'private'}, with ${count(pack)}.`);
			log.blank();
			log.dim('Add it anywhere with:');
			log.raw(`  skilless add ${short(pack.url)}`);
			if (!pack.public) {
				log.blank();
				log.dim('Only you can add it until you make it public on skilless.dev.');
			}
		});
	});

/* ----------------------------------------------------------------- delete */

const deleteSchema = defaultCommandOptionsSchema.extend({ yes: z.boolean() });

const deletePack = new Command('delete')
	.description('Delete packs. Skills already added from them stay where they are.')
	.argument('[packs...]', 'Packs to delete, by name, id or URL. Omit to pick from a list.')
	.addOption(commonOptions.yes)
	.addOption(commonOptions.cwd)
	.action(async (refs: string[], raw) => {
		const options = parseOptions(deleteSchema, raw);
		log.intro(VERSION);

		await tryCommand(async () => {
			const api = requireApi();
			const packs = await spin('Checking skilless.dev', () => api.listPacks());

			let doomed: RemotePack[];
			if (refs.length > 0) {
				doomed = [...new Set(refs.map((ref) => find(packs, ref)))];
			} else {
				if (packs.length === 0) {
					log.info('You have no packs.');
					return;
				}
				if (!isInteractive) {
					throw new SkillessError('Name the packs to delete.', {
						suggestion: 'Run `skilless packs list` to see yours.'
					});
				}

				const ids = await multiselect(
					'Delete',
					packs.map((pack) => ({ name: pack.id, message: pack.name, hint: count(pack) }))
				);
				doomed = packs.filter((pack) => ids.includes(pack.id));
				if (doomed.length === 0) {
					log.info('Nothing selected.');
					return;
				}
			}

			const names = doomed.map((pack) => pack.name).join(', ');
			log.warn(
				`Anyone who added ${doomed.length === 1 ? 'it' : 'them'} keeps the skills, but stops getting updates.`
			);

			const ok = options.yes || (await confirm(`Delete ${names}? This cannot be undone.`, false));
			if (!ok) {
				log.info('Nothing was deleted.');
				return;
			}

			for (const pack of doomed) {
				await api.deletePack(pack.id);
				log.step(`Deleted ${pack.name}.`);
			}
		});
	});

export const packs = new Command('packs')
	.description('Make and manage your packs on skilless.dev.')
	.addCommand(list)
	.addCommand(create)
	.addCommand(deletePack);
