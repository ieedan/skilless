import crypto from 'node:crypto';

export type SkillFile = { path: string; contents: string };

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
