import crypto from 'node:crypto';

export type SkillFile = { path: string; contents: string };

const NUL = String.fromCharCode(0);

/**
 * Must stay byte for byte identical to the CLI's `hashFiles`, or every sync sees
 * a conflict that isn't there.
 */
export function hashFiles(files: SkillFile[]): string {
	const hash = crypto.createHash('sha256');

	for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
		hash.update(file.path);
		hash.update(NUL);
		hash.update(file.contents);
		hash.update(NUL);
	}

	return hash.digest('hex');
}

export function containsNul(contents: string): boolean {
	return contents.includes(NUL);
}

export function hashToken(token: string): string {
	return crypto.createHash('sha256').update(token).digest('hex');
}

export function mintToken(): string {
	return `sk_${crypto.randomBytes(32).toString('base64url')}`;
}
