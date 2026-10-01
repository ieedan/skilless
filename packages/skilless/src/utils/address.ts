import { z } from 'zod';
import { getApiUrl, getToken } from '@/utils/auth';
import { SkillessError } from '@/utils/errors';
import { FEATURES } from '@/utils/api';
import {
	assertValidName,
	fileBytes,
	hashFiles,
	isSafePath,
	MAX_SKILL_BYTES,
	SKILL_FILE
} from '@/utils/skill';
import type { LocalSkill } from '@/utils/types';

/*
 * Anything `skilless add` is given that is not plainly a git repository is
 * fetched first, to see what is there: a pack (any JSON with a `skills` list —
 * `skilless.dev/packs/<uuid>`, or a file on someone's own site), or one skill
 * (`skilless.dev/skills/<uuid>`). Neither, and it is cloned after all.
 */

const TIMEOUT_MS = 15_000;

export const packSchema = z.object({
	name: z.string().trim().min(1).optional(),
	description: z.string().optional(),
	skills: z.array(z.string())
});

export type Pack = z.infer<typeof packSchema>;

const skillSchema = z.object({
	name: z.string(),
	files: z.array(
		z.object({
			path: z.string(),
			contents: z.string(),
			encoding: z.literal('base64').optional()
		})
	)
});

/** Hosts whose addresses are always repositories, so are cloned without asking first. */
const GIT_HOSTS = new Set(['github.com', 'gitlab.com', 'bitbucket.org', 'codeberg.org']);

/**
 * The http(s) URL to fetch for an argument that might be a pack or a skill,
 * or null for one that can only be a repository: `owner/repo`, a git host,
 * ssh, a `.git` URL, or anything pinned with `#ref`.
 *
 * `example.com/skills` gets `https://`, since an owner never has a dot in it;
 * `localhost:5173/…` gets `http://`.
 * A pack file on GitHub, linked the way the browser shows it, is fetched raw.
 */
export function addressOf(arg: string): string | null {
	const input = arg.trim();
	if (input.includes('#')) return null;

	let url: URL;
	try {
		if (/^https?:\/\//i.test(input)) url = new URL(input);
		else if (/^[^/@:\s]+(\.[^/@:\s]+|:\d+)(\/|$)/.test(input)) {
			// a dot or a port means a host: `example.com/skills`, `localhost:5173/packs/<uuid>`.
			// A host with a port only ever answers http locally, so it gets that
			url = new URL(
				`${/:\d+(\/|$)/.test(input.split('/')[0] ?? '') && !input.includes('.') ? 'http' : 'https'}://${input}`
			);
		} else return null;
	} catch {
		return null;
	}

	if (url.hostname === 'github.com') {
		const [owner, repo, marker, ref, ...file] = url.pathname.split('/').filter(Boolean);
		if (marker === 'blob' && ref && file.at(-1)?.endsWith('.json')) {
			return `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${file.join('/')}`;
		}
		return null;
	}

	if (GIT_HOSTS.has(url.hostname) || url.pathname.endsWith('.git')) return null;

	return url.href;
}

/** skilless itself, which knows who you are and so may answer for private things. */
function isOurs(url: URL): boolean {
	const api = new URL(getApiUrl());
	return url.host === api.host || url.hostname === 'skilless.dev';
}

const PACK_PAGE =
	/^\/(?:my-)?packs\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i;

/**
 * skilless serves a pack's page at `/packs/<uuid>` (and edits it at
 * `/my-packs/<uuid>`), and its JSON beside it at `/packs/<uuid>.json`. Either
 * page is taken to mean the JSON; any other path is left as it is.
 */
export function packFile(pathname: string): string {
	const uuid = PACK_PAGE.exec(pathname)?.[1];
	return uuid ? `/packs/${uuid.toLowerCase()}.json` : pathname;
}

/** How an address reads in output: no scheme, no trailing slash. */
export function addressLabel(url: string): string {
	return url.replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

export type Probed =
	{ kind: 'pack'; url: string; pack: Pack } | { kind: 'skill'; url: string; skill: LocalSkill };

/**
 * Fetches an address and says what is there, or null when it is neither a
 * pack nor a skill — a self-hosted git server's web page, say — so the caller
 * can clone it instead. skilless's own addresses never fall back to git: a
 * miss there is a missing (or private) skill or pack, and says so.
 */
export async function probe(address: string): Promise<Probed | null> {
	const url = new URL(address);
	const ours = isOurs(url);
	const label = addressLabel(address);

	// a pack's page, copied from the browser, reads as the file beside it
	if (ours) url.pathname = packFile(url.pathname);

	// your token only ever goes to the server it came from
	const token = ours && url.host === new URL(getApiUrl()).host ? getToken() : undefined;

	let response: Response;
	let text: string;
	try {
		response = await fetch(url, {
			headers: {
				Accept: 'application/json',
				...FEATURES,
				...(token ? { Authorization: `Bearer ${token}` } : {})
			},
			signal: AbortSignal.timeout(TIMEOUT_MS)
		});
		text = await response.text();
	} catch (cause) {
		if (!ours) return null;
		throw new SkillessError(`Couldn't reach ${label}.`, {
			suggestion: 'Check your connection, then try again.',
			cause
		});
	}

	if (!response.ok) {
		if (!ours) return null;

		if (response.status === 401) {
			throw new SkillessError('Your sign-in was rejected.', {
				suggestion: 'Run `skilless auth` to sign in again.'
			});
		}
		if (response.status === 404) {
			throw new SkillessError(`Nothing at ${label}, or it is private.`, {
				suggestion: token
					? 'Check the address. A private one can only be added by its owner.'
					: 'If it is yours, run `skilless auth` to sign in first.'
			});
		}
		throw new SkillessError(`${label} answered ${response.status}.`);
	}

	let json: unknown;
	try {
		json = JSON.parse(text);
	} catch {
		if (ours) throw new SkillessError(`${label} is not a skill or a pack.`);
		return null;
	}

	const pack = packSchema.safeParse(json);
	if (pack.success) return { kind: 'pack', url: url.href, pack: pack.data };

	const skill = skillSchema.safeParse(json);
	if (skill.success) return { kind: 'skill', url: url.href, skill: toLocal(skill.data, label) };

	if (ours) throw new SkillessError(`${label} is not a skill or a pack.`);
	return null;
}

/**
 * A fetched skill, checked as strictly as one read off disk: a valid name, a
 * SKILL.md, under the size cap, and no path that leaves its folder.
 */
function toLocal(skill: z.infer<typeof skillSchema>, label: string): LocalSkill {
	const name = skill.name.toLowerCase();
	assertValidName(name);

	const unsafe = skill.files.find((file) => !isSafePath(file.path));
	if (unsafe) throw new SkillessError(`${label} has a file outside its folder: ${unsafe.path}`);

	if (!skill.files.some((file) => file.path === SKILL_FILE)) {
		throw new SkillessError(`${label} has no ${SKILL_FILE}.`);
	}

	let bytes = 0;
	for (const file of skill.files) {
		// binary files come as base64; one sent as text must be text
		if (file.encoding !== 'base64' && file.contents.includes('\0')) {
			throw new SkillessError(`${label}/${file.path} is not text.`);
		}
		bytes += fileBytes(file).byteLength;
	}
	if (bytes > MAX_SKILL_BYTES) throw new SkillessError(`${label} is larger than 3MB.`);

	return {
		name,
		dir: '',
		files: skill.files,
		contentHash: hashFiles(skill.files),
		editedAt: Date.now()
	};
}
