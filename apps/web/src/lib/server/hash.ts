import crypto from 'node:crypto';

/** Text as is, or a binary file's bytes as base64. */
export type SkillFile = { path: string; contents: string; encoding?: 'base64' };

/** A file's size in bytes, whichever way it travels. */
export function byteLength(file: SkillFile): number {
	return Buffer.byteLength(file.contents, file.encoding === 'base64' ? 'base64' : 'utf8');
}

const NUL = String.fromCharCode(0);

export function containsNul(contents: string): boolean {
	return contents.includes(NUL);
}

export function hashToken(token: string): string {
	return crypto.createHash('sha256').update(token).digest('hex');
}

export function mintToken(): string {
	return `sk_${crypto.randomBytes(32).toString('base64url')}`;
}
