/** Text as is, or a binary file's bytes as base64 (`encoding: 'base64'`). */
export type SkillFile = { path: string; contents: string; encoding?: 'base64' };

/** A skill as it exists in `~/.skilless/skills`. */
export type LocalSkill = {
	name: string;
	dir: string;
	files: SkillFile[];
	contentHash: string;
	/** Max file mtime in the skill directory. The last-write-wins tiebreak. */
	editedAt: number;
};

/** A pack, by where it was read from: a URL, or a file on this machine. */
export type PackRef = {
	url: string;
	/** Its `name`, shown as where its skills came from. */
	name?: string;
};

/**
 * Where a skill was copied from by `skilless add`: a git repository, or a
 * skill served as JSON at an address like `skilless.dev/skills/<user>/<skill>` (then
 * `path` is empty). `hash` is the upstream contentHash as of the last add or
 * update, which is how `update` tells an untouched copy from one you have edited.
 */
export type SkillSource = {
	url: string;
	ref?: string;
	/** The skill's directory inside the repo. Empty for the repo root, or an address. */
	path: string;
	hash: string;
	/** The pack that last added it. Its origin, and how `update` finds the packs you follow. */
	pack?: PackRef;
};

/** A skill as the API reports it, without file contents. */
export type RemoteSkill = {
	name: string;
	contentHash: string;
	editedAt: number;
	updatedAt: number;
	/** Global skills are resolved into every project without being added to one. */
	global: boolean;
	/** Null when it was not copied from a repo, or the server predates sources. */
	source: SkillSource | null;
	/** `@user/skill`, what a pack entry names it by. Only in the list, and null until the username is known. */
	address?: string | null;
};

export type RemoteSkillWithFiles = RemoteSkill & { files: SkillFile[] };
