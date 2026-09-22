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

/** A skill as the API reports it, without file contents. */
export type RemoteSkill = {
	name: string;
	contentHash: string;
	editedAt: number;
	updatedAt: number;
	/** Global skills are resolved into every project without being added to one. */
	global: boolean;
};

export type RemoteSkillWithFiles = RemoteSkill & { files: SkillFile[] };
