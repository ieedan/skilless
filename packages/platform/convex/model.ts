import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { convexError, createConvexError } from './errors';

export type SkillFile = { path: string; contents: string };

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

/**
 * Pulls `description` out of a SKILL.md frontmatter block.
 *
 * Deliberately not a YAML parser: the frontmatter contract is two scalar keys,
 * and pulling in a parser to read them would cost more than it buys.
 */
export function parseDescription(contents: string): string | undefined {
	const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(contents);
	if (!match) return undefined;

	const line = /^description:[ \t]*(.*)$/m.exec(match[1]);
	if (!line) return undefined;

	const value = line[1]
		.trim()
		.replace(/^["'](.*)["']$/, '$1')
		.trim();
	return value.length > 0 ? value : undefined;
}

export type SkillSummary = Doc<'skills'> & {
	description?: string;
	/**
	 * The one file, when a skill has exactly one. Lets the list link straight at
	 * it instead of bouncing through the skill and being redirected.
	 */
	soleFile?: string;
};

/**
 * The website's skill list, which shows a description under each name.
 *
 * `description` lives in SKILL.md rather than on the row, so this reads one
 * file set per skill. Fine at a personal library's scale; if that stops being
 * true, denormalize it onto the skill at upsert time instead. `soleFile` rides
 * along on the same read and costs nothing extra.
 */
export async function listSkillsForDisplay(ctx: QueryCtx, userId: string): Promise<SkillSummary[]> {
	const skills = await listSkills(ctx, userId);

	return await Promise.all(
		skills.map(async (skill) => {
			const files = await readFiles(ctx, skill._id);
			const main = files.find((file) => file.path === 'SKILL.md');

			return {
				...skill,
				description: main ? parseDescription(main.contents) : undefined,
				soleFile: files.length === 1 ? files[0].path : undefined
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

export async function readFiles(ctx: QueryCtx, skillId: Id<'skills'>): Promise<SkillFile[]> {
	const rows = await ctx.db
		.query('skillFiles')
		.withIndex('by_skill', (q) => q.eq('skillId', skillId))
		.collect();

	return rows
		.map((r) => ({ path: r.path, contents: r.contents }))
		.sort((a, b) => a.path.localeCompare(b.path));
}

async function replaceFiles(ctx: MutationCtx, skillId: Id<'skills'>, files: SkillFile[]) {
	const existing = await ctx.db
		.query('skillFiles')
		.withIndex('by_skill', (q) => q.eq('skillId', skillId))
		.collect();

	for (const row of existing) await ctx.db.delete(row._id);
	for (const file of files) await ctx.db.insert('skillFiles', { skillId, ...file });
}

export async function upsertSkill(
	ctx: MutationCtx,
	args: {
		userId: string;
		name: string;
		files: SkillFile[];
		contentHash: string;
		editedAt: number;
	}
): Promise<Id<'skills'>> {
	const existing = await findSkill(ctx, args.userId, args.name);
	const now = Date.now();

	if (existing) {
		await ctx.db.patch(existing._id, {
			contentHash: args.contentHash,
			editedAt: args.editedAt,
			updatedAt: now
		});
		await replaceFiles(ctx, existing._id, args.files);
		return existing._id;
	}

	const skillId = await ctx.db.insert('skills', {
		userId: args.userId,
		name: args.name,
		contentHash: args.contentHash,
		editedAt: args.editedAt,
		updatedAt: now
	});
	await replaceFiles(ctx, skillId, args.files);
	return skillId;
}

/**
 * Replaces one file's contents in an existing skill.
 *
 * `editedAt` is supplied rather than derived: the CLI reports the file's mtime,
 * and a browser has none, so the caller decides. The website passes its own
 * clock, which makes a web save the newer edit against any CLI state older than
 * that moment — the same last-write-wins rule the CLI already plays by.
 */
export async function writeSkillFile(
	ctx: MutationCtx,
	args: {
		userId: string;
		name: string;
		path: string;
		contents: string;
		contentHash: string;
		editedAt: number;
	}
): Promise<void> {
	const skill = await findSkill(ctx, args.userId, args.name);
	if (!skill) throw createConvexError(convexError.SkillNotFound());

	const row = (
		await ctx.db
			.query('skillFiles')
			.withIndex('by_skill', (q) => q.eq('skillId', skill._id))
			.collect()
	).find((f) => f.path === args.path);

	if (!row) throw createConvexError(convexError.SkillFileNotFound());

	await ctx.db.patch(row._id, { contents: args.contents });
	await ctx.db.patch(skill._id, {
		contentHash: args.contentHash,
		editedAt: args.editedAt,
		updatedAt: Date.now()
	});
}

/**
 * Removes a file, or every file beneath a directory prefix.
 *
 * Whether a skill may be left without a SKILL.md, or with no files at all, is
 * decided by the caller — the CLI can already produce either shape by upserting
 * a different file set, so enforcing it only here would just be inconsistent.
 */
export async function deleteSkillPath(
	ctx: MutationCtx,
	args: {
		userId: string;
		name: string;
		path: string;
		contentHash: string;
		editedAt: number;
	}
): Promise<number> {
	const skill = await findSkill(ctx, args.userId, args.name);
	if (!skill) throw createConvexError(convexError.SkillNotFound());

	const rows = await ctx.db
		.query('skillFiles')
		.withIndex('by_skill', (q) => q.eq('skillId', skill._id))
		.collect();

	const prefix = `${args.path}/`;
	const doomed = rows.filter((row) => row.path === args.path || row.path.startsWith(prefix));

	if (doomed.length === 0) throw createConvexError(convexError.SkillFileNotFound());

	for (const row of doomed) await ctx.db.delete(row._id);

	await ctx.db.patch(skill._id, {
		contentHash: args.contentHash,
		editedAt: args.editedAt,
		updatedAt: Date.now()
	});

	return doomed.length;
}

/**
 * Creates a skill, refusing to clobber one that already exists.
 *
 * Distinct from `upsertSkill`, which the CLI uses to push whatever it has on
 * disk. Creating from the website is a first write, so a name collision is a
 * mistake rather than an update.
 */
export async function createSkill(
	ctx: MutationCtx,
	args: {
		userId: string;
		name: string;
		files: SkillFile[];
		contentHash: string;
		editedAt: number;
	}
): Promise<Id<'skills'>> {
	if (await findSkill(ctx, args.userId, args.name)) {
		throw createConvexError(convexError.SkillAlreadyExists());
	}

	return await upsertSkill(ctx, args);
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

	let project = await findProject(ctx, userId, key);
	if (!project) {
		const projectId = await ctx.db.insert('projects', { userId, key });
		project = await ctx.db.get(projectId);
	}
	if (!project) throw createConvexError(convexError.ProjectNotFound());

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
