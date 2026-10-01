import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { fileBytes, hashFiles, isValidName, toSkillFile } from '@/utils/skill';

describe('hashFiles', () => {
	it('does not depend on file order', () => {
		const a = hashFiles([
			{ path: 'SKILL.md', contents: 'one' },
			{ path: 'b.md', contents: 'two' }
		]);
		const b = hashFiles([
			{ path: 'b.md', contents: 'two' },
			{ path: 'SKILL.md', contents: 'one' }
		]);

		expect(a).toBe(b);
	});

	it('changes when contents change', () => {
		const before = hashFiles([{ path: 'SKILL.md', contents: 'one' }]);
		const after = hashFiles([{ path: 'SKILL.md', contents: 'two' }]);

		expect(before).not.toBe(after);
	});

	it('cannot be fooled by moving text across the path boundary', () => {
		const a = hashFiles([{ path: 'ab', contents: 'c' }]);
		const b = hashFiles([{ path: 'a', contents: 'bc' }]);

		expect(a).not.toBe(b);
	});

	it('hashes text exactly as it did before binary files', () => {
		// the old way: the string itself. Every skill already synced carries one of these.
		const old = crypto.createHash('sha256');
		old.update('SKILL.md').update('\0').update('héllo — ✓').update('\0');

		expect(hashFiles([{ path: 'SKILL.md', contents: 'héllo — ✓' }])).toBe(old.digest('hex'));
	});

	it('hashes a file by its bytes, however it travels', () => {
		const bytes = Buffer.from('plain words', 'utf8');
		const asText = hashFiles([{ path: 'a.txt', contents: 'plain words' }]);
		const asBase64 = hashFiles([
			{ path: 'a.txt', contents: bytes.toString('base64'), encoding: 'base64' }
		]);

		expect(asBase64).toBe(asText);
	});
});

describe('toSkillFile', () => {
	it('keeps text as text', () => {
		expect(toSkillFile('SKILL.md', Buffer.from('# hi\n'))).toEqual({
			path: 'SKILL.md',
			contents: '# hi\n'
		});
	});

	it('carries a file with a NUL byte as base64', () => {
		const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]);
		const file = toSkillFile('logo.png', png);

		expect(file.encoding).toBe('base64');
		expect(fileBytes(file).equals(png)).toBe(true);
	});

	it('carries bytes that are not valid UTF-8 as base64, rather than mangling them', () => {
		const latin1 = Buffer.from([0x63, 0x61, 0x66, 0xe9]); // "café" in Latin-1
		const file = toSkillFile('notes.txt', latin1);

		expect(file.encoding).toBe('base64');
		expect(fileBytes(file).equals(latin1)).toBe(true);
	});
});

describe('isValidName', () => {
	it('accepts the shapes real skills use', () => {
		expect(isValidName('document-session')).toBe(true);
		expect(isValidName('implementjs-kit')).toBe(true);
		expect(isValidName('svelte.testing')).toBe(true);
	});

	it('rejects anything that would not survive a URL or a path', () => {
		expect(isValidName('')).toBe(false);
		expect(isValidName('-leading')).toBe(false);
		expect(isValidName('Upper')).toBe(false);
		expect(isValidName('has space')).toBe(false);
		expect(isValidName('../escape')).toBe(false);
		expect(isValidName('a'.repeat(65))).toBe(false);
	});
});
