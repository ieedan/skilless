import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { convexError, createConvexError } from './errors';
import { parse } from 'yaml';
import { r2 } from './r2';

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
	const main = files.find((file) => file.path === 'SKILL.md');
	return {
		...(main ? parseFrontmatter(main.contents) : {}),
		soleFile: files.length === 1 ? files[0].path : undefined
	};
}

export type SkillSummary = Doc<'skills'> & {
	/** Projects the skill is explicitly bound to. Globals reach every project regardless. */
	projectIds: Id<'projects'>[];
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

			return { ...skill, projectIds: bindings.map((binding) => binding.projectId) };
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

/** Where one file's contents live. What a skill row points at, never the contents. */
export type StoredFile = { path: string; key: string; sha256: string; size: number };

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
		skillId = await ctx.db.insert('skills', { userId: args.userId, name: args.name, ...fields });
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
