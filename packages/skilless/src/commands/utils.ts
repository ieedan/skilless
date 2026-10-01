import os from 'node:os';
import { Option } from 'commander';
import path from 'pathe';
import pc from 'picocolors';
import { z } from 'zod';
import { addressLabel, addressOf } from '@/utils/address';
import { ApiClient } from '@/utils/api';
import { getApiUrl, getToken } from '@/utils/auth';
import type { LibraryEntry } from '@/utils/library';
import { NotAProjectError, NotAuthenticatedError, SkillessError } from '@/utils/errors';
import * as git from '@/utils/git';
import { shouldCopy } from '@/utils/install';
import { packLabel } from '@/utils/pack';
import * as project from '@/utils/project';
import type { Skipped } from '@/utils/project';
import { flush } from '@/utils/library';
import { confirm, isInteractive, log, spin } from '@/utils/prompts';
import { Remote } from '@/utils/remote';
import type { SkillFile } from '@/utils/types';

export const TRACE_ENV_VAR = 'SKILLESS_TRACE';

export const defaultCommandOptionsSchema = z.object({
	cwd: z.string()
});

export const commonOptions = {
	cwd: new Option('--cwd <path>', 'The current working directory.').default(process.cwd()),
	yes: new Option('-y, --yes', 'Skip confirmation prompts.').default(false),
	sync: new Option(
		'-s, --sync',
		'Check skilless.dev for changes first. Without it, only what is on this machine is read.'
	),
	project: new Option(
		'--project <key>',
		'Override the project key. Defaults to the normalized git remote.'
	)
};

export function parseOptions<T>(schema: z.ZodType<T>, raw: unknown): T {
	const parsed = schema.safeParse(raw);
	if (parsed.success) return parsed.data;

	return error(
		new SkillessError('Invalid options.', {
			suggestion: parsed.error.issues.map((issue) => `  ${issue.message}`).join('\n')
		})
	);
}

export function error(err: Error): never {
	if (process.env[TRACE_ENV_VAR] === '1') {
		console.trace(err);
	} else {
		log.error(pc.red(err.toString()));
	}

	process.exit(1);
}

/** Runs a command, turning any throw into a clean one line failure. */
export async function tryCommand<T>(run: () => Promise<T>): Promise<T> {
	try {
		return await run();
	} catch (e) {
		if (e instanceof SkillessError) return error(e);

		return error(
			new SkillessError(e instanceof Error ? e.message : String(e), {
				suggestion: `Run with ${TRACE_ENV_VAR}=1 for a stack trace.`,
				cause: e
			})
		);
	}
}

export function requireApi(): ApiClient {
	const token = getToken();
	if (!token) throw new NotAuthenticatedError();

	return new ApiClient(token, getApiUrl());
}

/**
 * The server, only when `--sync` asks for it. Everything a command reads is
 * on this machine already; what it changes goes up in the background.
 */
export function remoteIf(sync: boolean | undefined): Remote | null {
	return sync ? new Remote() : null;
}

/**
 * Runs a command's reads. With a remote, whatever is queued goes first, so
 * what comes back includes it; without one this is just `run`.
 */
export async function load<T>(remote: Remote | null, run: () => Promise<T>): Promise<T> {
	if (!remote) return run();

	return spin('Checking skilless.dev', async () => {
		await flush(remote);
		return run();
	});
}

/** A repository as `github.com/owner/repo`, or an address without its scheme. */
function sourceLabel(url: string): string {
	return addressOf(url) ? addressLabel(url) : (git.normalizeRemote(url) ?? url);
}

/**
 * The gray details beside a skill wherever it is listed: where it came from,
 * and whether it is missing here or has changes that haven't been sent.
 * `synced` is off when signed out, where "not synced" would tag every skill.
 */
export function skillDetails(skill: LibraryEntry, synced = getToken() !== null): string[] {
	const details: string[] = [];

	if (skill.source?.pack) details.push(`from ${packLabel(skill.source.pack)}`);
	else if (skill.source) details.push(`from ${sourceLabel(skill.source.url)}`);
	if (!skill.local) details.push('not on this machine');
	else if (synced && skill.unsynced) details.push('not synced');

	return details;
}

/**
 * Picker choices laid out like \`skilless list\`: names in a column, details
 * beside them in gray. A \`disabled\` reason leads the details and the choice
 * cannot be picked.
 */
export function skillChoices(
	skills: { entry: LibraryEntry; disabled?: string }[]
): { name: string; message: string; hint?: string; disabled?: boolean }[] {
	const width = Math.max(0, ...skills.map(({ entry }) => entry.name.length)) + 2;

	return skills.map(({ entry, disabled }) => {
		const hint = [...(disabled ? [disabled] : []), ...skillDetails(entry)].join(' · ');
		return {
			name: entry.name,
			message: hint ? entry.name.padEnd(width) : entry.name,
			...(hint ? { hint } : {}),
			...(disabled ? { disabled: true } : {})
		};
	});
}

/**
 * A skill's files from the server, for one your library has that is not on
 * this machine yet. Null when the server cannot be reached.
 */
export async function fetchFiles(
	remote: Remote,
	name: string,
	message = `Fetching ${name}`
): Promise<SkillFile[] | null> {
	const fetched = await spin(message, () => remote.try((api) => api.getSkill(name)));
	return fetched?.files ?? null;
}

/**
 * A project is identified by its git remote, because that is the only thing a
 * cloud agent in a fresh container can work out for itself.
 */
export function requireProjectKey(cwd: string, override?: string): string {
	if (override) return override;

	const key = git.projectKey(cwd);
	if (!key) throw new NotAProjectError();

	return key;
}

/** How the user-level skill directories read in a message. */
export const USER_SKILLS = '~/.agents/skills';

/** A path as it reads in a message, with the home directory shortened to `~`. */
export function tilde(target: string): string {
	const home = path.normalize(os.homedir());
	return target === home || target.startsWith(`${home}/`)
		? `~${target.slice(home.length)}`
		: target;
}

/**
 * Settles what a refresh could not link, then warns about whatever is left.
 *
 * A skill whose place is taken by something skilless did not make is offered
 * back one at a time: overwrite it, or leave it. `--yes` overwrites without
 * asking; without a terminal nothing is overwritten.
 */
export async function settleRefresh(
	result: { skipped: Skipped[]; missing?: string[] },
	opts: { copy?: boolean; yes?: boolean } = {}
): Promise<void> {
	for (const skip of result.skipped) {
		if (skip.reason === 'tracked') {
			log.warn(`\`${skip.name}\` is tracked by git here, so it was left alone.`);
			continue;
		}

		const where = (skip.occupied?.paths ?? []).map(tilde).join(' and ');

		const replace = opts.yes || (isInteractive && (await confirm(`Overwrite ${where}?`, false)));

		if (!replace) {
			if (isInteractive) {
				log.dim(`Kept ${where}, so ${skip.name} is not linked there.`);
			} else {
				log.warn(`Skipped ${skip.name}: ${where} was not made by skilless.`);
				log.dim('  Run this in a terminal to overwrite it, or pass --yes.');
			}
			continue;
		}

		project.overwrite(skip, { copy: shouldCopy(opts.copy) });
		log.step(`Overwrote ${where}.`);
	}

	for (const name of result.missing ?? []) {
		log.warn(`${name} is not on this machine yet, so it will be linked on the next sync.`);
	}
}
