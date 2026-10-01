import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

/**
 * Where a skill was copied from. `url` is a git repository, or a skill served
 * as JSON (`skilless.dev/skills/<user>/<skill>`), in which case `path` is empty.
 * `pack` is the pack that last added it — what the app and CLI show as its
 * origin, and how `skilless update` finds the packs you follow.
 */
export const sourceValidator = v.object({
	url: v.string(),
	ref: v.optional(v.string()),
	/** The skill's directory inside the repo. Empty for the repo root. */
	path: v.string(),
	hash: v.string(),
	pack: v.optional(v.object({ url: v.string(), name: v.optional(v.string()) }))
});

export default defineSchema({
	/**
	 * Who a user is in public addresses: their GitHub login, as
	 * `skilless.dev/skills/<username>/<skill>`. Locked to GitHub, so it follows a
	 * rename on GitHub at the next sign-in. Keyed by GitHub's numeric id, which
	 * never changes, to look the login up again.
	 */
	profiles: defineTable({
		userId: v.string(),
		githubId: v.string(),
		/** As GitHub writes it, for display. */
		login: v.string(),
		/** The login lowercased: what addresses use, and unique across users. */
		username: v.string(),
		/** When GitHub was last asked for the login. */
		checkedAt: v.number()
	})
		.index('by_user', ['userId'])
		.index('by_username', ['username']),

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
		 * Where a skill was copied from by `skilless add`, so `skilless update` can
		 * refresh it. `hash` is the upstream contentHash as of the last add or
		 * update — equal to `contentHash` until someone edits.
		 */
		source: v.optional(sourceValidator),
		/** Anyone can read a public skill at its address. Otherwise only its owner. */
		public: v.optional(v.boolean()),
		/** Every time it was added to a library, signed in or not. What browsing ranks by. */
		installs: v.optional(v.number()),
		deletedAt: v.optional(v.number()),
		/** Server receive time. Display only — never compared against a client clock. */
		updatedAt: v.number()
	})
		.index('by_user_and_name', ['userId', 'name'])
		.index('by_user', ['userId'])
		.index('by_public_and_installs', ['public', 'installs'])
		.searchIndex('search_name', { searchField: 'name', filterFields: ['public'] }),

	/**
	 * A list of skills from anywhere, added together with `skilless add <pack>`.
	 * Served as JSON at `skilless.dev/packs/<user>/<slug>` — the same shape as a pack
	 * file someone writes by hand.
	 */
	packs: defineTable({
		userId: v.string(),
		uuid: v.string(),
		name: v.string(),
		description: v.optional(v.string()),
		/**
		 * Its address, `skilless.dev/packs/<username>/<slug>`: from its name when
		 * made, unique among the owner's packs, and kept through a rename so links
		 * and other packs' entries keep working.
		 */
		slug: v.string(),
		/** Sources, as written in a pack file: git repos and `skilless.dev/skills/<user>/<skill>`. */
		skills: v.array(v.string()),
		/** Anyone can read a public pack at its address. Otherwise only its owner. */
		public: v.optional(v.boolean()),
		/**
		 * How many skills it brings, as of the last change to it or a scan of one
		 * of its repos (see `model.snapshotCount`). `countPartial` while a repo
		 * entry has not been scanned yet, so the count is at least this.
		 */
		skillCount: v.optional(v.number()),
		countPartial: v.optional(v.boolean()),
		/** Every time it was added, signed in or not. What browsing ranks by. */
		installs: v.optional(v.number()),
		updatedAt: v.number()
	})
		.index('by_user', ['userId'])
		.index('by_user_and_slug', ['userId', 'slug'])
		.index('by_public_and_installs', ['public', 'installs'])
		.searchIndex('search_name', { searchField: 'name', filterFields: ['public'] })
		/** Links between packs only: never in an address. */
		.index('by_uuid', ['uuid']),

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
		/** Bytes. */
		size: v.number(),
		/** Not text: an image, a font, a compiled helper. Read as bytes, never as a string. */
		binary: v.optional(v.boolean())
	}).index('by_skill', ['skillId']),

	/** A project, keyed by its normalized git remote e.g. `github.com/ieedan/layerchart`. */
	projects: defineTable({
		userId: v.string(),
		key: v.string(),
		/**
		 * GitHub's view of the repo, cached by `github.refresh` so the project pages
		 * render it straight off. Absent until the first lookup, and never set for
		 * other hosts. `reachable` is false for a private repo the app is not
		 * installed on.
		 */
		repo: v.optional(
			v.object({
				description: v.union(v.string(), v.null()),
				reachable: v.boolean(),
				checkedAt: v.number()
			})
		)
	})
		.index('by_user_and_key', ['userId', 'key'])
		.index('by_user', ['userId']),

	/**
	 * The GitHub repos the app can reach for a user, cached by `github.fetchRepos`
	 * so the project pickers read them from here rather than waiting on GitHub.
	 * A repo only becomes a project once a skill is bound to it.
	 */
	repos: defineTable({
		userId: v.string(),
		/** A project key, e.g. `github.com/ieedan/skilless`. */
		key: v.string(),
		description: v.union(v.string(), v.null()),
		private: v.boolean(),
		/**
		 * Whether GitHub's code search finds a SKILL.md in it, so pickers can leave
		 * out empty repos without scanning each. Absent when search cannot say:
		 * it skips forks, and needs a token.
		 */
		hasSkills: v.optional(v.boolean())
	})
		.index('by_user', ['userId'])
		.index('by_user_and_key', ['userId', 'key']),

	/**
	 * Which packs include which, so a pack whose skill count changes can tell
	 * the packs holding it to count again. Rebuilt from a pack's entries on
	 * every change to them.
	 */
	packLinks: defineTable({
		from: v.id('packs'),
		/** The included pack's UUID, which may not exist (yet, or any more). */
		to: v.string()
	})
		.index('by_from', ['from'])
		.index('by_to', ['to']),

	/**
	 * What a GitHub repo holds, as one user can see it: its description and every
	 * skill in it, read by `scans.scan` so the website can show and pick skills
	 * from a repo without cloning it. Per user, since a private repo's contents
	 * are only theirs to see.
	 */
	repoScans: defineTable({
		userId: v.string(),
		/** A project key, e.g. `github.com/anthropics/skills`. */
		key: v.string(),
		/** False when the repo could not be reached: gone, or private and not shared with the app. */
		found: v.boolean(),
		private: v.boolean(),
		description: v.union(v.string(), v.null()),
		/** Every directory holding a SKILL.md, with what its frontmatter says. `''` is the repo root. */
		skills: v.array(
			v.object({
				dir: v.string(),
				name: v.string(),
				description: v.optional(v.string()),
				/** SKILL.md is its only file, so a link goes to it rather than the folder. */
				sole: v.optional(v.boolean())
			})
		),
		scannedAt: v.number()
	}).index('by_user_and_key', ['userId', 'key']),

	/**
	 * Installs per skill or pack per hour, so "trending" (the last 24 hours) is a
	 * sum of a day of rows rather than a scan of every install. Hourly so a "hot"
	 * view (this hour against the last) can come later from the same rows.
	 */
	installBuckets: defineTable({
		kind: v.union(v.literal('skill'), v.literal('pack')),
		itemId: v.union(v.id('skills'), v.id('packs')),
		/** The hour's start, in ms. */
		hour: v.number(),
		count: v.number()
	})
		.index('by_hour', ['hour'])
		.index('by_item_and_hour', ['itemId', 'hour']),

	/** When a user's `repos` were last filled from GitHub. At most one row per user. */
	repoSyncs: defineTable({
		userId: v.string(),
		/** Absent until the first lookup settles. */
		syncedAt: v.optional(v.number()),
		/** Set while a lookup is in flight, so opening several pickers queues just one. */
		requestedAt: v.optional(v.number()),
		/** Superseded by `skillsVersion`; left so rows written with it still validate. */
		skillsSearched: v.optional(v.boolean()),
		/** How the last lookup decided which repos have skills; an older cache looks again once. */
		skillsVersion: v.optional(v.number())
	}).index('by_user', ['userId']),

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
		/**
		 * `mcp` for a token an MCP client got by OAuth, named after the client.
		 * Absent for one made by the CLI or on the settings page.
		 */
		kind: v.optional(v.literal('mcp')),
		createdAt: v.number(),
		lastUsedAt: v.optional(v.number())
	})
		.index('by_hash', ['hash'])
		.index('by_user', ['userId']),

	/**
	 * A one-time OAuth authorization code, issued when someone approves an MCP
	 * client and exchanged moments later for a token in `cliTokens`.
	 */
	oauthCodes: defineTable({
		userId: v.string(),
		/** sha256 of the code. The plaintext only ever travels in the redirect. */
		hash: v.string(),
		clientId: v.string(),
		/** Shown as the token's name, so the user can find and revoke it in settings. */
		clientName: v.string(),
		redirectUri: v.string(),
		/** PKCE S256 challenge the token request's verifier must hash to. */
		codeChallenge: v.string(),
		expiresAt: v.number()
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
