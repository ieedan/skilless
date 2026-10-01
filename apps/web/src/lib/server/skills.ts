import { byteLength, containsNul, type SkillFile } from './hash';

/** Matches the server's limit (see files.ts): every file's bytes together. */
const MAX_SKILL_BYTES = 3 * 1024 * 1024;

export type SkillSource = {
	url: string;
	ref?: string;
	path: string;
	hash: string;
	pack?: { url: string; name?: string };
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

/** Relative, forward slashes, no `..`: skills are shared, so a path must stay inside its skill. */
function isSafePath(file: string): boolean {
	if (!file || file.includes('\\') || file.includes('\0') || file.startsWith('/')) return false;
	if (/^[a-z]:/i.test(file)) return false;
	return file.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

export function validateFiles(files: SkillFile[]): string | null {
	let bytes = 0;

	for (const file of files) {
		if (!isSafePath(file.path)) return `${file.path} is not a path inside the skill.`;
		// binary files come as base64; one sent as text must be text
		if (file.encoding !== 'base64' && containsNul(file.contents)) {
			return `${file.path} is not text. Send it with encoding "base64".`;
		}
		bytes += byteLength(file);
	}

	if (bytes > MAX_SKILL_BYTES) return 'Skill is larger than 3MB.';
	if (!files.some((file) => file.path === 'SKILL.md')) return 'Skill has no SKILL.md.';

	return null;
}
