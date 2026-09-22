import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
	/** A skill in a user's library. Soft deleted — `deletedAt` set means it lives in the trash. */
	skills: defineTable({
		userId: v.string(),
		name: v.string(),
		/** sha256 over the sorted (path, contents) pairs. Recomputed server side, never trusted. */
		contentHash: v.string(),
		/** Client reported max file mtime. The last-write-wins tiebreak. */
		editedAt: v.number(),
		/** Global skills are resolved into every project, without being bound to any. */
		global: v.optional(v.boolean()),
		/** Reserved for marketplace provenance. Unused in v0. */
		source: v.optional(
			v.object({
				marketplace: v.string(),
				id: v.string(),
				hash: v.string()
			})
		),
		deletedAt: v.optional(v.number()),
		/** Server receive time. Display only — never compared against a client clock. */
		updatedAt: v.number()
	})
		.index('by_user_and_name', ['userId', 'name'])
		.index('by_user', ['userId']),

	skillFiles: defineTable({
		skillId: v.id('skills'),
		path: v.string(),
		contents: v.string()
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
		.index('by_user', ['userId'])
});
