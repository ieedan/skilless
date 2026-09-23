import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'pathe';
import { describe, expect, it } from 'vitest';
import { isTracked, normalizeRemote, untrack } from '@/utils/git';

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

describe('untrack', () => {
	it('stages the removal but leaves the files on disk', () => {
		const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'skilless-git-'));
		const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
		git('init', '-q');
		fs.mkdirSync(path.join(repo, '.agents/skills/demo'), { recursive: true });
		fs.writeFileSync(path.join(repo, '.agents/skills/demo/SKILL.md'), '# demo');
		git('add', '.');

		expect(isTracked(repo, '.agents/skills/demo')).toBe(true);
		expect(untrack(repo, '.agents/skills/demo')).toBe(true);
		expect(isTracked(repo, '.agents/skills/demo')).toBe(false);
		expect(fs.existsSync(path.join(repo, '.agents/skills/demo/SKILL.md'))).toBe(true);

		fs.rmSync(repo, { recursive: true, force: true });
	});

	it('fails on a path git does not track', () => {
		const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'skilless-git-'));
		execFileSync('git', ['init', '-q'], { cwd: repo });

		expect(untrack(repo, 'missing')).toBe(false);

		fs.rmSync(repo, { recursive: true, force: true });
	});
});
