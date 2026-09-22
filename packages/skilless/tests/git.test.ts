import { describe, expect, it } from 'vitest';
import { normalizeRemote } from '@/utils/git';

describe('normalizeRemote', () => {
	it('collapses ssh and https forms of the same repo to one key', () => {
		const expected = 'github.com/ieedan/layerchart';

		expect(normalizeRemote('git@github.com:ieedan/layerchart.git')).toBe(expected);
		expect(normalizeRemote('https://github.com/ieedan/layerchart.git')).toBe(expected);
		expect(normalizeRemote('https://github.com/ieedan/layerchart')).toBe(expected);
		expect(normalizeRemote('ssh://git@github.com/ieedan/layerchart.git')).toBe(expected);
		expect(normalizeRemote('github.com/ieedan/layerchart')).toBe(expected);
	});

	it('ignores case, ports and credentials', () => {
		expect(normalizeRemote('https://GitHub.com/IEEDAN/LayerChart')).toBe(
			'github.com/ieedan/layerchart'
		);
		expect(normalizeRemote('ssh://git@github.com:22/ieedan/layerchart')).toBe(
			'github.com/ieedan/layerchart'
		);
		expect(normalizeRemote('https://user:pass@github.com/ieedan/layerchart')).toBe(
			'github.com/ieedan/layerchart'
		);
	});

	it('keeps non-github hosts and nested paths distinct', () => {
		expect(normalizeRemote('git@gitlab.com:group/sub/repo.git')).toBe('gitlab.com/group/sub/repo');
		expect(normalizeRemote('https://github.com/other/layerchart')).not.toBe(
			'github.com/ieedan/layerchart'
		);
	});

	it('rejects what it cannot key on', () => {
		expect(normalizeRemote('')).toBeNull();
		expect(normalizeRemote('   ')).toBeNull();
	});
});
