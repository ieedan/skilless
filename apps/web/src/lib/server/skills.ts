import { containsNul, type SkillFile } from './hash';

const MAX_SKILL_BYTES = 1024 * 1024;

export type SkillSource = {
	url: string;
	ref?: string;
	path: string;
	hash: string;
};

type SkillDoc = {
	name: string;
	contentHash: string;
	editedAt: number;
	updatedAt: number;
	global?: boolean;
	source?: SkillSource;
};

/** Never hand back `_id` or `userId` — no client has a use for them. */
export function toSkill(doc: SkillDoc) {
	return {
		name: doc.name,
		contentHash: doc.contentHash,
		editedAt: doc.editedAt,
		updatedAt: doc.updatedAt,
		global: doc.global ?? false,
		source: doc.source ?? null
	};
}

export function validateFiles(files: SkillFile[]): string | null {
	let bytes = 0;

	for (const file of files) {
		if (containsNul(file.contents)) return `${file.path} is not text.`;
		bytes += Buffer.byteLength(file.contents, 'utf8');
	}

	if (bytes > MAX_SKILL_BYTES) return 'Skill is larger than 1MB.';
	if (!files.some((file) => file.path === 'SKILL.md')) return 'Skill has no SKILL.md.';

	return null;
}
