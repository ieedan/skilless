import { describe, expect, it } from 'vitest';
import { hashFiles, isValidName } from '@/utils/skill';

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
