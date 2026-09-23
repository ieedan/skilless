export type SkillFile = { path: string; contents: string };

/** A skill as it exists in `~/.skilless/skills`. */
export type LocalSkill = {
	name: string;
	dir: string;
	files: SkillFile[];
	contentHash: string;
	/** Max file mtime in the skill directory. The last-write-wins tiebreak. */
	editedAt: number;
};

/**
 * The git repository a skill was copied from by `skilless add <repo>`. `hash`
 * is the upstream contentHash as of the last add or update, which is how
 * `update` tells an untouched copy from one you have edited.
 */
export type SkillSource = {
	url: string;
	ref?: string;
	/** The skill's directory inside the repo. Empty for the repo root. */
	path: string;
	hash: string;
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
};

export type RemoteSkillWithFiles = RemoteSkill & { files: SkillFile[] };
