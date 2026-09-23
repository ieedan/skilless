import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
	/** A skill in a user's library. Soft deleted — `deletedAt` set means it lives in the trash. */
	skills: defineTable({
		userId: v.string(),
		name: v.string(),
		/** sha256 over the sorted (path, contents) pairs. Recomputed server side, never trusted. */
		contentHash: v.string(),
		/*
		 * SKILL.md frontmatter, parsed on every write so nothing that shows a skill
		 * has to read its files. `title` is the `name` field, which can differ from
		 * the name the skill is stored under; `metadata` is every other field.
		 */
		title: v.optional(v.string()),
		description: v.optional(v.string()),
		metadata: v.optional(v.record(v.string(), v.any())),
		/** The one file's path, when a skill has exactly one. */
		soleFile: v.optional(v.string()),
		/** Client reported max file mtime. The last-write-wins tiebreak. */
		editedAt: v.number(),
		/** Global skills are resolved into every project, without being bound to any. */
		global: v.optional(v.boolean()),
		/**
		 * The git repository a skill was copied from by `skilless add <repo>`, so
		 * `skilless update` can refresh it. `hash` is the upstream contentHash as
		 * of the last add or update — equal to `contentHash` until someone edits.
		 */
		source: v.optional(
			v.object({
				url: v.string(),
				ref: v.optional(v.string()),
				/** The skill's directory inside the repo. Empty for the repo root. */
				path: v.string(),
				hash: v.string()
			})
		),
		deletedAt: v.optional(v.number()),
		/** Server receive time. Display only — never compared against a client clock. */
		updatedAt: v.number()
	})
		.index('by_user_and_name', ['userId', 'name'])
		.index('by_user', ['userId']),

	/**
	 * One file of a skill. The contents live in R2 under `key`; this row is only
	 * the path and enough to avoid re-uploading a file that has not changed.
	 */
	skillFiles: defineTable({
		skillId: v.id('skills'),
		path: v.string(),
		/** R2 object key. Owned by this skill, never shared with another. */
		key: v.string(),
		/** sha256 of the contents, so an unchanged file keeps its object. */
		sha256: v.string(),
		/** Bytes, UTF-8. */
		size: v.number()
	}).index('by_skill', ['skillId']),

	/** A project, keyed by its normalized git remote e.g. `github.com/ieedan/layerchart`. */
	projects: defineTable({
		userId: v.string(),
		key: v.string()
	})
		.index('by_user_and_key', ['userId', 'key'])
		.index('by_user', ['userId']),

	bindings: defineTable({
		projectId: v.id('projects'),
		skillId: v.id('skills')
	})
		.index('by_project', ['projectId'])
		.index('by_skill', ['skillId'])
		.index('by_project_and_skill', ['projectId', 'skillId']),

	cliTokens: defineTable({
		userId: v.string(),
		/** sha256 of the token. The plaintext is shown once and never stored. */
		hash: v.string(),
		name: v.string(),
		createdAt: v.number(),
		lastUsedAt: v.optional(v.number())
	})
		.index('by_hash', ['hash'])
		.index('by_user', ['userId']),

	/** Per-user display settings. At most one row per user; absent means all defaults. */
	preferences: defineTable({
		userId: v.string(),
		/** Keeps the email out of the sidebar and account page, e.g. while screen sharing. */
		hideEmail: v.optional(v.boolean())
	}).index('by_user', ['userId'])
});
