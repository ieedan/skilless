import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { discoverSkills, frontmatter, isSource, locateSkill, parseSource } from '@/utils/source';

describe('isSource', () => {
	it('tells a repository from a library skill', () => {
		expect(isSource('mattpocock/skills')).toBe(true);
		expect(isSource('https://gitlab.com/a/b')).toBe(true);
		expect(isSource('git@github.com:a/b.git')).toBe(true);
		expect(isSource('grill-me')).toBe(false);
	});
});

describe('parseSource', () => {
	it('reads GitHub shorthand', () => {
		expect(parseSource('mattpocock/skills')).toEqual({
			url: 'https://github.com/mattpocock/skills.git',
			ref: undefined,
			subpath: undefined,
			label: 'github.com/mattpocock/skills'
		});
	});

	it('reads a subpath, a skill, and a ref', () => {
		expect(parseSource('owner/repo/skills/foo').subpath).toBe('skills/foo');
		expect(parseSource('owner/repo@grill-me').skill).toBe('grill-me');
		expect(parseSource('owner/repo#v2').ref).toBe('v2');
	});

	it('reads a host-prefixed address, as a pack file writes it', () => {
		expect(parseSource('github.com/ieedan/skills/.agents/skills/test')).toMatchObject({
			url: 'https://github.com/ieedan/skills.git',
			subpath: '.agents/skills/test',
			label: 'github.com/ieedan/skills'
		});
		expect(parseSource('github.com/owner/repo#v2')).toMatchObject({
			url: 'https://github.com/owner/repo.git',
			ref: 'v2',
			subpath: undefined
		});
	});

	it('reads GitHub tree URLs', () => {
		const source = parseSource('https://github.com/owner/repo/tree/main/skills/foo');

		expect(source.url).toBe('https://github.com/owner/repo.git');
		expect(source.ref).toBe('main');
		expect(source.subpath).toBe('skills/foo');
	});

	it('reads GitLab URLs on any host, with subgroups', () => {
		const source = parseSource('https://git.example.com/group/sub/repo/-/tree/dev/skills');

		expect(source.url).toBe('https://git.example.com/group/sub/repo.git');
		expect(source.ref).toBe('dev');
		expect(source.subpath).toBe('skills');

		expect(parseSource('gitlab:group/repo').url).toBe('https://gitlab.com/group/repo');
	});

	it('clones any other git URL as is', () => {
		expect(parseSource('https://bitbucket.org/owner/repo.git').url).toBe(
			'https://bitbucket.org/owner/repo.git'
		);
		expect(parseSource('git@codeberg.org:owner/repo.git')).toMatchObject({
			url: 'git@codeberg.org:owner/repo.git',
			label: 'codeberg.org/owner/repo'
		});
		expect(parseSource('ssh://git@host:2222/owner/repo.git#main')).toMatchObject({
			url: 'ssh://git@host:2222/owner/repo.git',
			ref: 'main'
		});
	});

	it('refuses to leave the repository', () => {
		expect(() => parseSource('owner/repo/../../etc')).toThrow();
		expect(() => parseSource('ext::sh -c touch% /tmp/pwned')).toThrow();
	});
});

describe('frontmatter', () => {
	it('reads single line fields, quoted or not', () => {
		expect(frontmatter('---\nname: "grill-me"\ndescription: Asks hard questions\n---\n')).toEqual({
			name: 'grill-me',
			description: 'Asks hard questions'
		});
	});

	it('skips block scalars rather than misreading them', () => {
		expect(frontmatter('---\nname: a\ndescription: >\n  long\n---\n').description).toBeUndefined();
	});
});

describe('discoverSkills', () => {
	let repo: string;

	const skill = (rel: string, name?: string) => {
		const dir = path.join(repo, rel);
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(
			path.join(dir, 'SKILL.md'),
			name ? `---\nname: ${name}\ndescription: d\n---\n` : '# skill\n'
		);
	};

	beforeEach(() => {
		repo = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'skilless-source-'));
	});

	afterEach(() => {
		fs.rmSync(repo, { recursive: true, force: true });
	});

	it('finds skills in the usual containers, named by their frontmatter', () => {
		skill('skills/engineering/tdd', 'tdd');
		skill('skills/grill', 'Grill Me');
		skill('.claude/skills/local-only');

		expect(discoverSkills(repo).map((found) => found.name)).toEqual([
			'grill-me',
			'local-only',
			'tdd'
		]);
	});

	it('ignores deep examples when the usual places have skills', () => {
		skill('skills/real', 'real');
		skill('examples/nested/demo', 'demo');

		expect(discoverSkills(repo).map((found) => found.name)).toEqual(['real']);
	});

	it('walks the whole tree when nothing is in the usual places', () => {
		skill('some/deep/place', 'deep');

		expect(discoverSkills(repo).map((found) => found.name)).toEqual(['deep']);
	});

	it('takes a skill at the search root as the only one', () => {
		skill('skills/one', 'one');
		skill('skills/two', 'two');

		expect(discoverSkills(repo, 'skills/one').map((found) => found.name)).toEqual(['one']);
	});
});

describe('locateSkill', () => {
	let repo: string;

	beforeEach(() => {
		repo = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'skilless-locate-'));
	});

	afterEach(() => {
		fs.rmSync(repo, { recursive: true, force: true });
	});

	const skill = (rel: string, name: string) => {
		fs.mkdirSync(path.join(repo, rel), { recursive: true });
		fs.writeFileSync(path.join(repo, rel, 'SKILL.md'), `---\nname: ${name}\n---\n`);
	};

	it('finds a skill where it was recorded', () => {
		skill('skills/tdd', 'tdd');
		expect(locateSkill(repo, 'skills/tdd', 'tdd')?.path).toBe('skills/tdd');
	});

	it('follows a skill the repo has moved, by name', () => {
		skill('skills/engineering/tdd', 'tdd');
		expect(locateSkill(repo, 'skills/tdd', 'tdd')?.path).toBe('skills/engineering/tdd');
	});

	it('never follows a recorded path out of the repo', () => {
		expect(locateSkill(repo, '../../etc', 'tdd')).toBeNull();
	});
});
