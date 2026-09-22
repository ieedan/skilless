import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let tmp: string;
let home: string;
let repo: string;

function git(args: string[], cwd = repo) {
	return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

beforeEach(() => {
	tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'skilless-'));
	home = path.join(tmp, 'home');
	repo = path.join(tmp, 'repo');

	fs.mkdirSync(path.join(home, 'skills', 'triage'), { recursive: true });
	fs.writeFileSync(path.join(home, 'skills', 'triage', 'SKILL.md'), '# triage\n');

	fs.mkdirSync(repo, { recursive: true });
	git(['init', '-q']);
	git(['config', 'user.email', 'test@example.com']);
	git(['config', 'user.name', 'test']);
	fs.writeFileSync(path.join(repo, 'README.md'), '# someone else\n');
	git(['add', '.']);
	git(['commit', '-qm', 'initial']);

	vi.resetModules();
	vi.stubEnv('SKILLESS_HOME', home);
});

afterEach(() => {
	vi.unstubAllEnvs();
	fs.rmSync(tmp, { recursive: true, force: true });
});

describe('materialize', () => {
	it('links a skill into both .agents and .claude', async () => {
		const project = await import('@/utils/project');

		const result = project.materialize(repo, [{ name: 'triage' }], { copy: false });

		expect(result.written).toEqual(['triage']);
		expect(result.skipped).toEqual([]);

		expect(fs.lstatSync(path.join(repo, '.agents/skills/triage')).isSymbolicLink()).toBe(true);
		expect(fs.lstatSync(path.join(repo, '.claude/skills/triage')).isSymbolicLink()).toBe(true);

		// the bridge resolves all the way through to the store
		expect(fs.readFileSync(path.join(repo, '.claude/skills/triage/SKILL.md'), 'utf8')).toContain(
			'triage'
		);
	});

	it('leaves the repo completely clean', async () => {
		const project = await import('@/utils/project');
		project.materialize(repo, [{ name: 'triage' }], { copy: false });

		// the whole point: someone else's repo shows no trace of your skills
		expect(git(['status', '--porcelain'])).toBe('');
	});

	it('writes real files in copy mode', async () => {
		const project = await import('@/utils/project');

		project.materialize(
			repo,
			[{ name: 'triage', files: [{ path: 'SKILL.md', contents: '# copied\n' }] }],
			{ copy: true }
		);

		const target = path.join(repo, '.agents/skills/triage/SKILL.md');
		expect(fs.lstatSync(target).isFile()).toBe(true);
		expect(fs.readFileSync(target, 'utf8')).toBe('# copied\n');
	});

	it('refuses to touch a path the repo already tracks', async () => {
		fs.mkdirSync(path.join(repo, '.claude/skills/triage'), { recursive: true });
		fs.writeFileSync(path.join(repo, '.claude/skills/triage/SKILL.md'), '# theirs\n');
		git(['add', '-f', '.claude']);
		git(['commit', '-qm', 'their skill']);

		const project = await import('@/utils/project');
		const result = project.materialize(repo, [{ name: 'triage' }], { copy: false });

		expect(result.written).toEqual([]);
		expect(result.skipped).toEqual([{ name: 'triage', reason: 'tracked' }]);
		expect(fs.readFileSync(path.join(repo, '.claude/skills/triage/SKILL.md'), 'utf8')).toBe(
			'# theirs\n'
		);
	});

	it('writes no marker file of its own', async () => {
		const project = await import('@/utils/project');
		project.materialize(repo, [{ name: 'triage' }], { copy: false });

		expect(fs.existsSync(path.join(repo, '.agents/skills/.skilless.json'))).toBe(false);

		// only the two links, nothing else
		expect(fs.readdirSync(path.join(repo, '.agents/skills'))).toEqual(['triage']);
	});

	it('cleans up the marker an older version left behind', async () => {
		const marker = path.join(repo, '.agents/skills/.skilless.json');
		fs.mkdirSync(path.dirname(marker), { recursive: true });
		fs.writeFileSync(marker, '{"version":1,"mode":"link","skills":["triage"]}');

		const project = await import('@/utils/project');
		project.materialize(repo, [{ name: 'triage' }], { copy: false });

		expect(fs.existsSync(marker)).toBe(false);
		expect(git(['status', '--porcelain'])).toBe('');
	});

	it('still recognises its own work in copy mode', async () => {
		const project = await import('@/utils/project');

		project.materialize(
			repo,
			[{ name: 'triage', files: [{ path: 'SKILL.md', contents: '# copied\n' }] }],
			{ copy: true }
		);

		// no symlink into the store here — ownership comes off the .claude side
		expect(fs.lstatSync(path.join(repo, '.agents/skills/triage')).isDirectory()).toBe(true);
		expect(project.ownedSkills(repo)).toEqual(['triage']);
		expect(project.unmaterialize(repo, ['triage'])).toEqual(['triage']);
		expect(fs.existsSync(path.join(repo, '.agents/skills/triage'))).toBe(false);
	});

	it('will not claim a directory it did not create', async () => {
		const theirs = path.join(repo, '.agents/skills/theirs');
		fs.mkdirSync(theirs, { recursive: true });
		fs.writeFileSync(path.join(theirs, 'SKILL.md'), '# theirs\n');

		const project = await import('@/utils/project');

		expect(project.ownedSkills(repo)).toEqual([]);
		expect(project.unmaterialize(repo, ['theirs'])).toEqual([]);
		expect(fs.existsSync(path.join(theirs, 'SKILL.md'))).toBe(true);

		const result = project.materialize(repo, [{ name: 'theirs' }], { copy: false });
		expect(result.skipped).toEqual([{ name: 'theirs', reason: 'occupied' }]);
		expect(fs.readFileSync(path.join(theirs, 'SKILL.md'), 'utf8')).toBe('# theirs\n');
	});

	it('prunes links whose skill was deleted elsewhere', async () => {
		const project = await import('@/utils/project');
		project.materialize(repo, [{ name: 'triage' }], { copy: false });

		// what `skilless remove` on another machine leaves behind here
		fs.rmSync(path.join(home, 'skills', 'triage'), { recursive: true, force: true });

		expect(project.prune(repo)).toEqual(['triage']);
		expect(fs.existsSync(path.join(repo, '.agents/skills/triage'))).toBe(false);
		expect(fs.existsSync(path.join(repo, '.claude/skills/triage'))).toBe(false);
		expect(git(['status', '--porcelain'])).toBe('');
	});

	it('unmaterializes without disturbing the repo', async () => {
		const project = await import('@/utils/project');
		project.materialize(repo, [{ name: 'triage' }], { copy: false });

		expect(project.unmaterialize(repo, ['triage'])).toEqual(['triage']);
		expect(fs.existsSync(path.join(repo, '.agents/skills/triage'))).toBe(false);
		expect(git(['status', '--porcelain'])).toBe('');
	});
});

describe('worktrees', () => {
	it('finds the exclude file from inside a worktree', async () => {
		const worktree = path.join(tmp, 'wt');
		git(['worktree', 'add', '-q', '-b', 'side', worktree]);

		const gitUtils = await import('@/utils/git');
		const exclude = gitUtils.excludeFile(worktree);

		// .git is a file here — a hardcoded .git/info/exclude would write nowhere
		expect(fs.lstatSync(path.join(worktree, '.git')).isFile()).toBe(true);
		expect(exclude).toBe(path.join(repo, '.git', 'info', 'exclude'));
	});

	it('keeps a worktree clean too', async () => {
		const worktree = path.join(tmp, 'wt');
		git(['worktree', 'add', '-q', '-b', 'side', worktree]);

		const project = await import('@/utils/project');
		project.materialize(worktree, [{ name: 'triage' }], { copy: false });

		expect(git(['status', '--porcelain'], worktree)).toBe('');
	});
});
