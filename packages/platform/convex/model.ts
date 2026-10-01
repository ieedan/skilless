import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { authComponent } from './auth';
import { convexError, createConvexError } from './errors';
import { parse } from 'yaml';
import { r2, toLinks, type FileLink } from './r2';
import { skillsAt } from './discover';
import { profileByUsername, profileOf } from './profiles';

/**
 * A file as it travels: text as is, or a binary file's bytes as base64. Stored
 * and hashed as bytes either way, so a text file hashes as it always has.
 */
export type SkillFile = { path: string; contents: string; encoding?: 'base64' };

/** A file's bytes, whichever way it travels. */
export function bytesOf(file: SkillFile): Buffer {
	return Buffer.from(file.contents, file.encoding === 'base64' ? 'base64' : 'utf8');
}

/** Project keys GitHub can describe (see `github.refresh`). */
export const isGithubKey = (key: string) => key.startsWith('github.com/');

/** Live (non trashed) skill by name. Names are unique among live skills only. */
export async function findSkill(
	ctx: QueryCtx,
	userId: string,
	name: string
): Promise<Doc<'skills'> | null> {
	const rows = await ctx.db
		.query('skills')
		.withIndex('by_user_and_name', (q) => q.eq('userId', userId).eq('name', name))
		.collect();

	return rows.find((r) => r.deletedAt === undefined) ?? null;
}

export async function listSkills(ctx: QueryCtx, userId: string): Promise<Doc<'skills'>[]> {
	const rows = await ctx.db
		.query('skills')
		.withIndex('by_user', (q) => q.eq('userId', userId))
		.collect();

	return rows.filter((r) => r.deletedAt === undefined).sort((a, b) => a.name.localeCompare(b.name));
}

/** A SKILL.md frontmatter block as stored on the skill row. */
export type Frontmatter = {
	/** The `name` field, which can differ from the name the skill is stored under. */
	title?: string;
	description?: string;
	/** Every other top level field, as written. */
	metadata?: Record<string, unknown>;
};

/**
 * Reads the frontmatter out of a SKILL.md. Broken YAML reads as empty, since a
 * hand-edited file should still save; it just loses its title and description.
 */
export function parseFrontmatter(contents: string): Frontmatter {
	const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(contents)?.[1];
	if (!block) return {};

	let parsed: unknown;
	try {
		parsed = parse(block);
	} catch {
		return {};
	}
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

	const { name, description, ...rest } = toConvexValue(parsed) as Record<string, unknown>;
	const text = (value: unknown) =>
		typeof value === 'string' && value.trim() ? value.trim() : undefined;

	return {
		title: text(name),
		description: text(description),
		metadata: Object.keys(rest).length > 0 ? rest : undefined
	};
}

/**
 * YAML can hold things Convex cannot store: dates, and keys starting with `$`
 * or `_`. Round trip through JSON for the former and drop the latter.
 */
function toConvexValue(value: unknown): unknown {
	const walk = (node: unknown): unknown => {
		if (Array.isArray(node)) return node.map(walk);
		if (node && typeof node === 'object') {
			return Object.fromEntries(
				Object.entries(node)
					.filter(([key]) => key.length > 0 && !/^[$_]/.test(key))
					.map(([key, child]) => [key, walk(child)])
			);
		}
		return node;
	};
	return walk(JSON.parse(JSON.stringify(value)));
}

/**
 * What the website shows without opening the files, stored on the skill row
 * by every write, which always has the whole file set in hand.
 */
export function summarize(files: SkillFile[]): Frontmatter & { soleFile?: string } {
	const main = files.find((file) => file.path === 'SKILL.md' && file.encoding !== 'base64');
	return {
		...(main ? parseFrontmatter(main.contents) : {}),
		soleFile: files.length === 1 ? files[0].path : undefined
	};
}

export type SkillSummary = Doc<'skills'> & {
	/** Projects the skill is explicitly bound to. Globals reach every project regardless. */
	projectIds: Id<'projects'>[];
	/**
	 * For a copy of a skill on skilless: the original's hash as it is now, so the
	 * list knows live whether there is anything to update. Null when the original
	 * is gone or no longer yours to see; absent for any other source.
	 */
	upstreamHash?: string | null;
};

/** The website's skill list. Reads only skill rows and bindings — never file contents. */
export async function listSkillsForDisplay(ctx: QueryCtx, userId: string): Promise<SkillSummary[]> {
	const skills = await listSkills(ctx, userId);

	return await Promise.all(
		skills.map(async (skill) => {
			const bindings = await ctx.db
				.query('bindings')
				.withIndex('by_skill', (q) => q.eq('skillId', skill._id))
				.collect();

			const address = skill.source ? parseAddress(skill.source.url) : null;
			let upstreamHash: string | null | undefined;
			if (address?.kind === 'skill') {
				const original = await findSkillAt(ctx, address.username, address.name);
				upstreamHash = original && canView(original, userId) ? original.contentHash : null;
			}

			return {
				...skill,
				projectIds: bindings.map((binding) => binding.projectId),
				...(upstreamHash !== undefined ? { upstreamHash } : {})
			};
		})
	);
}

export async function listTrash(ctx: QueryCtx, userId: string): Promise<Doc<'skills'>[]> {
	const rows = await ctx.db
		.query('skills')
		.withIndex('by_user', (q) => q.eq('userId', userId))
		.collect();

	return rows
		.filter((r) => r.deletedAt !== undefined)
		.sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));
}

export async function listGlobalSkills(ctx: QueryCtx, userId: string): Promise<Doc<'skills'>[]> {
	return (await listSkills(ctx, userId)).filter((skill) => skill.global === true);
}

export async function setGlobal(
	ctx: MutationCtx,
	userId: string,
	name: string,
	value: boolean
): Promise<void> {
	const skill = await findSkill(ctx, userId, name);
	if (!skill) throw createConvexError(convexError.SkillNotFound());

	await ctx.db.patch(skill._id, { global: value });
}

export async function setSource(
	ctx: MutationCtx,
	userId: string,
	name: string,
	source: Doc<'skills'>['source'] | null
): Promise<void> {
	const skill = await findSkill(ctx, userId, name);
	if (!skill) throw createConvexError(convexError.SkillNotFound());

	await ctx.db.patch(skill._id, { source: source ?? undefined });
}

export async function setPublic(
	ctx: MutationCtx,
	userId: string,
	name: string,
	value: boolean
): Promise<void> {
	const skill = await findSkill(ctx, userId, name);
	if (!skill) throw createConvexError(convexError.SkillNotFound());

	await ctx.db.patch(skill._id, { public: value });
}

/* -------------------------------------------------------------- addresses */

/**
 * Something on skilless, as an address names it: a skill by its owner's
 * username and its name, or a pack by its owner's username and its slug.
 */
export type Address =
	| { kind: 'skill'; username: string; name: string }
	| { kind: 'pack'; username: string; slug: string };

/**
 * Reads an address however it is written: the CLI's `@user/skill` and
 * `@user/pack/<slug>`, or a page or its JSON on any skilless host,
 * `<host>/skills/<user>/<skill>` and `<host>/packs/<user>/<slug>`. A host is
 * required there, with a dot or a port, so `owner/repo/...` stays a GitHub path.
 */
export function parseAddress(entry: string): Address | null {
	const raw = entry.trim().split('#')[0]!.replace(/\/+$/, '');

	const at = /^@([a-z\d][a-z\d-]*)\/(?:pack\/([^/\s]+)|([^/\s]+))$/i.exec(raw);
	if (at) {
		const username = at[1]!.toLowerCase();
		return at[2]
			? { kind: 'pack', username, slug: at[2].toLowerCase() }
			: { kind: 'skill', username, name: at[3]!.toLowerCase() };
	}

	const url =
		/^(?:https?:\/\/)?([^/\s]+)\/(skills|packs)\/([a-z\d][a-z\d-]*)\/([^/\s]+?)(?:\.json)?$/i.exec(
			raw
		);
	if (!url) return null;
	const host = url[1]!.toLowerCase();
	if (!/[.:]/.test(host) || host === 'github.com' || host === 'www.github.com') return null;

	const username = url[3]!.toLowerCase();
	const tail = url[4]!.toLowerCase();
	return url[2]!.toLowerCase() === 'skills'
		? { kind: 'skill', username, name: tail }
		: { kind: 'pack', username, slug: tail };
}

/** A live skill by its owner's username and its name. */
export async function findSkillAt(
	ctx: QueryCtx,
	username: string,
	name: string
): Promise<Doc<'skills'> | null> {
	const profile = await profileByUsername(ctx, username);
	return profile ? await findSkill(ctx, profile.userId, name) : null;
}

/** A pack by its owner's username and its slug. */
export async function findPackAt(
	ctx: QueryCtx,
	username: string,
	slug: string
): Promise<Doc<'packs'> | null> {
	const profile = await profileByUsername(ctx, username);
	return profile ? await findPackBySlug(ctx, profile.userId, slug) : null;
}

/** The skill an entry names, when it is a skilless skill address. */
async function skillOfEntry(ctx: QueryCtx, entry: string): Promise<Doc<'skills'> | null> {
	const address = parseAddress(entry);
	return address?.kind === 'skill' ? await findSkillAt(ctx, address.username, address.name) : null;
}

/** The pack an entry names, when it is a skilless pack address. */
async function packOfEntry(ctx: QueryCtx, entry: string): Promise<Doc<'packs'> | null> {
	const address = parseAddress(entry);
	return address?.kind === 'pack' ? await findPackAt(ctx, address.username, address.slug) : null;
}

/** Whether the user already has a copy of this skilless skill: one whose source is its address. */
export async function hasCopyOf(
	ctx: QueryCtx,
	userId: string,
	username: string,
	name: string
): Promise<boolean> {
	const skills = await listSkills(ctx, userId);
	return skills.some((skill) => {
		const address = skill.source ? parseAddress(skill.source.url) : null;
		return (
			address?.kind === 'skill' &&
			address.username === username.toLowerCase() &&
			address.name === name
		);
	});
}

/** A user's username, or null for one GitHub has not been asked about yet. */
export async function usernameOf(ctx: QueryCtx, userId: string): Promise<string | null> {
	return (await profileOf(ctx, userId))?.username ?? null;
}

/** Who made a skill or pack, as its public page shows them. */
export type Owner = { name: string; image: string | null; username: string | null };

export async function ownerOf(ctx: QueryCtx, userId: string): Promise<Owner> {
	const user = await authComponent.getAnyUserById(ctx, userId);
	// never the email: that is only ever shown to its owner, and only if they allow it
	return {
		name: user?.name?.trim() || 'Someone',
		image: user?.image ?? null,
		username: await usernameOf(ctx, userId)
	};
}

/** May this viewer read it? The owner always; anyone else only once it is public. */
export function canView(row: { userId: string; public?: boolean }, viewerId: string | null) {
	return row.public === true || row.userId === viewerId;
}

export type SkillView = {
	skill: Doc<'skills'>;
	files: FileLink[];
	owner: Owner;
	/** The viewer owns it, so the page can say who else can see it. */
	mine: boolean;
};

/** A skill at its address, for its page and its JSON. Null when absent or not the viewer's to see. */
export async function viewSkill(
	ctx: QueryCtx,
	username: string,
	name: string,
	viewerId: string | null
): Promise<SkillView | null> {
	const skill = await findSkillAt(ctx, username, name);
	if (!skill || !canView(skill, viewerId)) return null;

	return {
		skill,
		files: toLinks(await fileRows(ctx, skill._id)),
		owner: await ownerOf(ctx, skill.userId),
		mine: skill.userId === viewerId
	};
}

/* ------------------------------------------------------------------ packs */

/** What a pack entry that names a skill on skilless resolves to, for display. */
export type EntrySkill = {
	/** Its owner's, for its address. */
	username: string;
	name: string;
	title?: string;
	description?: string;
	public: boolean;
	/** The viewer's own skill. */
	mine: boolean;
};

/**
 * Where a pack entry points on GitHub — `github.com/owner/repo/path#ref`,
 * `owner/repo`, or a `/tree/<ref>/` URL — as a repo key and a path in it.
 * Null for anything else.
 */
export function githubEntry(entry: string): { key: string; subpath: string } | null {
	const rest = entry
		.trim()
		.split('#')[0]!
		.replace(/^https?:\/\//i, '')
		.replace(/\/+$/, '');
	let segments = rest.split('/').filter(Boolean);

	if (segments[0]?.toLowerCase() === 'github.com') segments = segments.slice(1);
	else if (segments[0]?.includes('.') || segments[0]?.includes(':')) return null;

	const [owner, repo, marker, ref, ...tail] = segments;
	if (!owner || !repo) return null;

	const sub = (marker === 'tree' || marker === 'blob') && ref ? tail : segments.slice(2);
	return {
		key: `github.com/${owner}/${repo.replace(/\.git$/i, '')}`.toLowerCase(),
		subpath: sub.join('/')
	};
}

/** What a repository entry holds, from the pack owner's scan of it. */
export type EntryRepo = {
	/** False when the scan could not reach it. */
	found: boolean;
	description: string | null;
	/** The skills `skilless add` would take from the entry, by name. */
	skills: { name: string; description?: string; dir: string; sole?: boolean }[];
};

/** What a pack entry naming another pack resolves to, for display. */
export type EntryPack = {
	/** Its owner's username and its slug, for its address. */
	username: string;
	slug: string;
	name: string;
	description?: string;
	skillCount: number;
	countPartial: boolean;
	public: boolean;
	mine: boolean;
	owner: Owner;
};

export type ResolvedEntry = {
	entry: string;
	skill: EntrySkill | null;
	repo: EntryRepo | null;
	pack: EntryPack | null;
};

/**
 * A pack's entries, each with what it names: the skill, for a skilless address
 * the viewer can see; the repo's description and skills, for a GitHub entry its
 * owner has scanned. Anything else — gone, private to someone else, not scanned
 * yet — resolves to nulls and shows as written.
 */
export async function resolveEntries(
	ctx: QueryCtx,
	entries: string[],
	viewerId: string | null,
	ownerId: string
): Promise<ResolvedEntry[]> {
	return await Promise.all(
		entries.map(async (entry): Promise<ResolvedEntry> => {
			const none = { entry, skill: null, repo: null, pack: null };

			const address = parseAddress(entry);
			if (address?.kind === 'pack') {
				const pack = await findPackAt(ctx, address.username, address.slug);
				if (!pack || !canView(pack, viewerId)) return none;

				return {
					...none,
					pack: {
						username: address.username,
						slug: pack.slug,
						name: pack.name,
						...(pack.description ? { description: pack.description } : {}),
						skillCount: pack.skillCount ?? pack.skills.length,
						countPartial: pack.skillCount === undefined || pack.countPartial === true,
						public: pack.public === true,
						mine: pack.userId === viewerId,
						owner: await ownerOf(ctx, pack.userId)
					}
				};
			}

			if (address?.kind === 'skill') {
				const skill = await findSkillAt(ctx, address.username, address.name);
				if (!skill || !canView(skill, viewerId)) return none;

				return {
					entry,
					repo: null,
					pack: null,
					skill: {
						username: address.username,
						name: skill.name,
						title: skill.title,
						description: skill.description,
						public: skill.public === true,
						mine: skill.userId === viewerId
					}
				};
			}

			const github = githubEntry(entry);
			if (!github) return none;

			const scan = await ctx.db
				.query('repoScans')
				.withIndex('by_user_and_key', (q) => q.eq('userId', ownerId).eq('key', github.key))
				.unique();
			// a private repo's contents are only its owner's to see
			if (!scan || (scan.private && viewerId !== ownerId)) return none;

			return {
				entry,
				skill: null,
				pack: null,
				repo: {
					found: scan.found,
					description: scan.description,
					skills: skillsAt(scan.skills, github.subpath).map(({ name, description, dir, sole }) => ({
						name,
						dir,
						...(description ? { description } : {}),
						...(sole ? { sole } : {})
					}))
				}
			};
		})
	);
}

/**
 * Counts the skills a pack brings and stores it on the pack, so lists show it
 * without resolving every entry. A skilless address is one skill; a GitHub
 * entry is however many skills its owner's scan found there, or one, and the
 * count marked partial, until it has been scanned; a pack is however many its
 * own count says. A change goes on up to every pack that includes this one.
 */
export async function snapshotCount(
	ctx: MutationCtx,
	pack: Doc<'packs'>,
	/** Packs already counted on this pass, so a loop that slipped in cannot recount forever. */
	counted: Set<string> = new Set()
): Promise<void> {
	if (counted.has(pack.uuid)) return;
	counted.add(pack.uuid);

	let count = 0;
	let partial = false;

	for (const entry of pack.skills) {
		if (parseAddress(entry)?.kind === 'pack') {
			const inner = await packOfEntry(ctx, entry);
			if (inner && canView(inner, pack.userId)) {
				count += inner.skillCount ?? inner.skills.length;
				partial ||= inner.skillCount === undefined || inner.countPartial === true;
			} else {
				count++;
				partial = true;
			}
			continue;
		}

		const github = githubEntry(entry);
		if (!github) {
			count++;
			continue;
		}

		const scan = await ctx.db
			.query('repoScans')
			.withIndex('by_user_and_key', (q) => q.eq('userId', pack.userId).eq('key', github.key))
			.unique();

		if (scan?.found) {
			count += skillsAt(scan.skills, github.subpath).length;
		} else {
			count++;
			partial ||= !scan;
		}
	}

	if (pack.skillCount === count && (pack.countPartial ?? false) === partial) return;

	await ctx.db.patch(pack._id, { skillCount: count, countPartial: partial });
	await recountIncluding(ctx, pack.uuid, counted);
}

/** Counts again every pack that includes this one, as its count, or it, changed. */
export async function recountIncluding(
	ctx: MutationCtx,
	uuid: string,
	counted: Set<string> = new Set()
): Promise<void> {
	const links = await ctx.db
		.query('packLinks')
		.withIndex('by_to', (q) => q.eq('to', uuid))
		.collect();

	for (const link of links) {
		const outer = await ctx.db.get(link.from);
		if (outer) await snapshotCount(ctx, outer, counted);
	}
}

/** Rewrites which packs this one includes, from its entries. */
export async function linkPacks(ctx: MutationCtx, pack: Doc<'packs'>): Promise<void> {
	const links = await ctx.db
		.query('packLinks')
		.withIndex('by_from', (q) => q.eq('from', pack._id))
		.collect();
	for (const link of links) await ctx.db.delete(link._id);

	// linked by the pack's internal id, which a rename of anything never touches
	const included = new Set<string>();
	for (const entry of pack.skills) {
		const inner = await packOfEntry(ctx, entry);
		if (inner) included.add(inner.uuid);
	}
	for (const to of included) await ctx.db.insert('packLinks', { from: pack._id, to });
}

/**
 * Refuses entries that would make a pack include itself — directly, or through
 * packs that lead back to it. Only skilless packs can be followed here; a loop
 * through a pack hosted elsewhere is the CLI's to catch.
 */
export async function assertNoLoop(
	ctx: QueryCtx,
	pack: Doc<'packs'>,
	entries: string[]
): Promise<void> {
	const invalid = (reason: string) => {
		throw createConvexError(convexError.InvalidPack({ reason }));
	};

	const seen = new Set<string>();
	const reaches = async (uuid: string): Promise<boolean> => {
		if (uuid === pack.uuid) return true;
		if (seen.has(uuid)) return false;
		seen.add(uuid);

		const inner = await findPack(ctx, uuid);
		for (const entry of inner?.skills ?? []) {
			const next = await packOfEntry(ctx, entry);
			if (next && (await reaches(next.uuid))) return true;
		}
		return false;
	};

	for (const entry of entries) {
		const inner = await packOfEntry(ctx, entry);
		if (!inner) continue;
		if (inner.uuid === pack.uuid) invalid('a pack cannot include itself');

		if (await reaches(inner.uuid)) {
			const name = canView(inner, pack.userId) ? inner.name : 'that pack';
			invalid(`${name} already includes ${pack.name}, so adding it would make a loop`);
		}
	}
}

/** One skill a pack brings, and the entry that would bring just that skill. */
export type PackSkill = {
	/** `github.com/owner/repo/dir`, or a skill's address: add it to take this skill alone. */
	entry: string;
	name: string;
	description?: string;
	/** The repo has not been scanned, so this is the entry itself, not one skill of it. */
	unscanned?: boolean;
};

/**
 * Every skill a pack brings, nested packs included, each with an entry that
 * would bring it alone — for picking some of a pack's skills rather than the
 * whole pack. As the viewer can see it: private skills and repos of other
 * people are left out. A name two entries share is the first one's.
 */
export async function packSkills(
	ctx: QueryCtx,
	pack: Doc<'packs'>,
	viewerId: string | null
): Promise<PackSkill[]> {
	const found = new Map<string, PackSkill>();
	const visited = new Set<string>();

	const walk = async (current: Doc<'packs'>): Promise<void> => {
		if (visited.has(current.uuid)) return;
		visited.add(current.uuid);

		for (const raw of current.skills) {
			const entry = raw.trim();
			const take = (skill: PackSkill) => {
				if (!found.has(skill.name)) found.set(skill.name, skill);
			};

			const address = parseAddress(entry);
			if (address?.kind === 'pack') {
				const inner = await findPackAt(ctx, address.username, address.slug);
				if (inner && canView(inner, viewerId)) await walk(inner);
				continue;
			}

			if (address?.kind === 'skill') {
				const skill = await skillOfEntry(ctx, entry);
				if (skill && canView(skill, viewerId)) {
					take({
						entry,
						name: skill.name,
						...(skill.description ? { description: skill.description } : {})
					});
				}
				continue;
			}

			const github = githubEntry(entry);
			if (!github) continue;

			const scan = await ctx.db
				.query('repoScans')
				.withIndex('by_user_and_key', (q) => q.eq('userId', current.userId).eq('key', github.key))
				.unique();
			if (scan?.private && viewerId !== current.userId) continue;

			if (!scan?.found) {
				take({ entry, name: github.key.slice('github.com/'.length), unscanned: true });
				continue;
			}

			// a pinned entry's skills stay pinned to the same ref
			const ref = entry.includes('#') ? `#${entry.split('#')[1]}` : '';
			for (const skill of skillsAt(scan.skills, github.subpath)) {
				take({
					entry: `${skill.dir ? `${github.key}/${skill.dir}` : github.key}${ref}`,
					name: skill.name,
					...(skill.description ? { description: skill.description } : {})
				});
			}
		}
	};

	await walk(pack);
	return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** A pack by its internal id, which only links between packs use. Never in an address. */
export async function findPack(ctx: QueryCtx, uuid: string): Promise<Doc<'packs'> | null> {
	return await ctx.db
		.query('packs')
		.withIndex('by_uuid', (q) => q.eq('uuid', uuid.toLowerCase()))
		.first();
}

/** One of a user's packs by its slug. */
export async function findPackBySlug(
	ctx: QueryCtx,
	userId: string,
	slug: string
): Promise<Doc<'packs'> | null> {
	return await ctx.db
		.query('packs')
		.withIndex('by_user_and_slug', (q) => q.eq('userId', userId).eq('slug', slug.toLowerCase()))
		.unique();
}

/** One of the user's own packs, by its slug, for changing it. */
export async function ownPack(ctx: QueryCtx, userId: string, slug: string): Promise<Doc<'packs'>> {
	const pack = await findPackBySlug(ctx, userId, slug);
	if (!pack) throw createConvexError(convexError.PackNotFound());
	return pack;
}

export async function listPacks(ctx: QueryCtx, userId: string): Promise<Doc<'packs'>[]> {
	const rows = await ctx.db
		.query('packs')
		.withIndex('by_user', (q) => q.eq('userId', userId))
		.collect();

	return rows.sort((a, b) => a.name.localeCompare(b.name));
}

export type PackView = {
	pack: Doc<'packs'>;
	entries: ResolvedEntry[];
	owner: Owner;
	mine: boolean;
};

/** A pack at its address, for its page and its JSON. Null when absent or not the viewer's to see. */
export async function viewPack(
	ctx: QueryCtx,
	username: string,
	slug: string,
	viewerId: string | null
): Promise<PackView | null> {
	const pack = await findPackAt(ctx, username, slug);
	return pack ? await packView(ctx, pack, viewerId) : null;
}

/** A pack as its page shows it. Null when it is not the viewer's to see. */
export async function packView(
	ctx: QueryCtx,
	pack: Doc<'packs'>,
	viewerId: string | null
): Promise<PackView | null> {
	if (!canView(pack, viewerId)) return null;

	return {
		pack,
		entries: await resolveEntries(ctx, pack.skills, viewerId, pack.userId),
		owner: await ownerOf(ctx, pack.userId),
		mine: pack.userId === viewerId
	};
}

/** Where one file's contents live. What a skill row points at, never the contents. */
export type StoredFile = {
	path: string;
	key: string;
	sha256: string;
	size: number;
	/** Bytes that are not text, served as is rather than read as a string. */
	binary?: boolean;
};

/** Every file row of a skill, sorted by path. */
export async function fileRows(ctx: QueryCtx, skillId: Id<'skills'>): Promise<Doc<'skillFiles'>[]> {
	const rows = await ctx.db
		.query('skillFiles')
		.withIndex('by_skill', (q) => q.eq('skillId', skillId))
		.collect();

	return rows.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Lands a new file set for a skill whose contents are already in R2.
 *
 * The write actions in `files.ts` read the skill, upload what changed, then
 * commit here. Anything that landed in between shows up as a moved `basedOn`
 * hash, or a key that is neither ours already nor freshly uploaded, and throws
 * `SkillChanged` so the action starts over from the new state instead of
 * clobbering it.
 *
 * Objects the old file set used and the new one does not are deleted here, in
 * the same transaction that stops pointing at them.
 */
export async function commitSkill(
	ctx: MutationCtx,
	args: {
		userId: string;
		name: string;
		/** Refuse to replace a live skill of the same name. */
		create: boolean;
		/** The `contentHash` the action read, or null if there was no skill. */
		basedOn: string | null;
		files: StoredFile[];
		/** Keys the action uploaded for this commit. */
		uploaded: string[];
		contentHash: string;
		title?: string;
		description?: string;
		metadata?: Record<string, unknown>;
		soleFile?: string;
		editedAt: number;
	}
): Promise<Doc<'skills'>> {
	const existing = await findSkill(ctx, args.userId, args.name);

	if (args.create && existing) throw createConvexError(convexError.SkillAlreadyExists());
	if ((existing?.contentHash ?? null) !== args.basedOn) {
		throw createConvexError(convexError.SkillChanged());
	}

	const rows = existing ? await fileRows(ctx, existing._id) : [];
	const usable = new Set([...rows.map((row) => row.key), ...args.uploaded]);
	if (args.files.some((file) => !usable.has(file.key))) {
		throw createConvexError(convexError.SkillChanged());
	}

	const fields = {
		contentHash: args.contentHash,
		title: args.title,
		description: args.description,
		metadata: args.metadata,
		soleFile: args.soleFile,
		editedAt: args.editedAt,
		updatedAt: Date.now()
	};

	let skillId: Id<'skills'>;
	if (existing) {
		skillId = existing._id;
		await ctx.db.patch(skillId, fields);
	} else {
		skillId = await ctx.db.insert('skills', {
			userId: args.userId,
			name: args.name,
			...fields
		});
	}

	for (const row of rows) await ctx.db.delete(row._id);
	for (const file of args.files) await ctx.db.insert('skillFiles', { skillId, ...file });

	const kept = new Set(args.files.map((file) => file.key));
	for (const row of rows) {
		if (!kept.has(row.key)) await r2.deleteObject(ctx, row.key);
	}

	const skill = await ctx.db.get(skillId);
	if (!skill) throw createConvexError(convexError.SkillNotFound());
	return skill;
}

/** Trashes a skill and unbinds it from every project. Restorable for 30 days. */
export async function softDeleteSkill(ctx: MutationCtx, userId: string, name: string) {
	const skill = await findSkill(ctx, userId, name);
	if (!skill) throw createConvexError(convexError.SkillNotFound());

	const bindings = await ctx.db
		.query('bindings')
		.withIndex('by_skill', (q) => q.eq('skillId', skill._id))
		.collect();

	for (const binding of bindings) await ctx.db.delete(binding._id);

	await ctx.db.patch(skill._id, { deletedAt: Date.now() });
}

export async function restoreSkill(ctx: MutationCtx, userId: string, skillId: Id<'skills'>) {
	const skill = await ctx.db.get(skillId);
	if (!skill || skill.userId !== userId) throw createConvexError(convexError.SkillNotFound());

	const live = await findSkill(ctx, userId, skill.name);
	if (live) throw createConvexError(convexError.SkillNameTaken());

	await ctx.db.patch(skill._id, { deletedAt: undefined });
}

export async function findProject(
	ctx: QueryCtx,
	userId: string,
	key: string
): Promise<Doc<'projects'> | null> {
	return await ctx.db
		.query('projects')
		.withIndex('by_user_and_key', (q) => q.eq('userId', userId).eq('key', key))
		.first();
}

/**
 * What a project actually gets: everything bound to it, plus every global skill.
 *
 * Globals resolve here rather than being materialized into `~/.claude/skills`, so
 * a cloud agent — which has no home directory to read — gets them too.
 */
export async function boundSkills(
	ctx: QueryCtx,
	userId: string,
	key: string
): Promise<Doc<'skills'>[]> {
	const skills = new Map<string, Doc<'skills'>>();

	for (const skill of await listGlobalSkills(ctx, userId)) {
		skills.set(skill.name, skill);
	}

	const project = await findProject(ctx, userId, key);

	if (project) {
		const bindings = await ctx.db
			.query('bindings')
			.withIndex('by_project', (q) => q.eq('projectId', project._id))
			.collect();

		for (const binding of bindings) {
			const skill = await ctx.db.get(binding.skillId);
			if (skill && skill.deletedAt === undefined) skills.set(skill.name, skill);
		}
	}

	return [...skills.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Every project a skill is currently bound to. Powers the website's unbind UI. */
export async function projectsForSkill(
	ctx: QueryCtx,
	skillId: Id<'skills'>
): Promise<Doc<'projects'>[]> {
	const bindings = await ctx.db
		.query('bindings')
		.withIndex('by_skill', (q) => q.eq('skillId', skillId))
		.collect();

	const projects: Doc<'projects'>[] = [];
	for (const binding of bindings) {
		const project = await ctx.db.get(binding.projectId);
		if (project) projects.push(project);
	}

	return projects.sort((a, b) => a.key.localeCompare(b.key));
}

/** The project for a key, created on first use the way `skilless add` would. */
export async function ensureProject(
	ctx: MutationCtx,
	userId: string,
	key: string
): Promise<Doc<'projects'>> {
	const existing = await findProject(ctx, userId, key);
	if (existing) return existing;

	const projectId = await ctx.db.insert('projects', { userId, key });

	// look the new repo up now, so the project list has its description before it is opened
	if (isGithubKey(key)) {
		await ctx.scheduler.runAfter(0, internal.github.refresh, {
			userId,
			projects: [{ id: projectId, key }]
		});
	}

	const project = await ctx.db.get(projectId);
	if (!project) throw createConvexError(convexError.ProjectNotFound());
	return project;
}

/** Replaces a project's bindings wholesale. Unknown skill names are reported, not silently dropped. */
export async function setBindings(
	ctx: MutationCtx,
	userId: string,
	key: string,
	names: string[]
): Promise<{ bound: string[]; unknown: string[] }> {
	const unknown: string[] = [];
	const skillIds: Id<'skills'>[] = [];
	const bound: string[] = [];

	for (const name of names) {
		const skill = await findSkill(ctx, userId, name);
		if (!skill) {
			unknown.push(name);
			continue;
		}
		skillIds.push(skill._id);
		bound.push(name);
	}

	const project = await ensureProject(ctx, userId, key);

	const existing = await ctx.db
		.query('bindings')
		.withIndex('by_project', (q) => q.eq('projectId', project._id))
		.collect();

	const keep = new Set(skillIds);
	for (const binding of existing) {
		if (!keep.has(binding.skillId)) await ctx.db.delete(binding._id);
	}

	const already = new Set(existing.map((b) => b.skillId));
	for (const skillId of skillIds) {
		if (!already.has(skillId)) {
			await ctx.db.insert('bindings', { projectId: project._id, skillId });
		}
	}

	return { bound, unknown };
}
