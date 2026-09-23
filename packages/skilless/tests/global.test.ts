import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RemoteSkillWithFiles } from '@/utils/types';

let tmp: string;
let store: string;
let home: string;
let repo: string;

function git(args: string[], cwd = repo) {
	return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

function skill(name: string, global: boolean): RemoteSkillWithFiles {
	return {
		name,
		contentHash: name,
		editedAt: 0,
		updatedAt: 0,
		global,
		source: null,
		files: [{ path: 'SKILL.md', contents: `# ${name}\n` }]
	};
}

function linked(dir: string, name: string): boolean {
	try {
		return fs.lstatSync(path.join(dir, name)).isSymbolicLink();
	} catch {
		return false;
	}
}

beforeEach(() => {
	tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'skilless-'));
	store = path.join(tmp, 'store');
	home = path.join(tmp, 'home');
	repo = path.join(tmp, 'repo');

	for (const name of ['triage', 'review']) {
		fs.mkdirSync(path.join(store, 'skills', name), { recursive: true });
		fs.writeFileSync(path.join(store, 'skills', name, 'SKILL.md'), `# ${name}\n`);
	}

	fs.mkdirSync(home, { recursive: true });
	fs.mkdirSync(repo, { recursive: true });
	git(['init', '-q']);
	git(['config', 'user.email', 'test@example.com']);
	git(['config', 'user.name', 'test']);
	fs.writeFileSync(path.join(repo, 'README.md'), '# someone else\n');
	git(['add', '.']);
	git(['commit', '-qm', 'initial']);

	vi.resetModules();
	vi.stubEnv('SKILLESS_HOME', store);
	vi.stubEnv('HOME', home);
	vi.stubEnv('USERPROFILE', home);
	vi.stubEnv('CLAUDE_CONFIG_DIR', '');
});

afterEach(() => {
	vi.unstubAllEnvs();
	fs.rmSync(tmp, { recursive: true, force: true });
});

describe('user scope', () => {
	it('links a global skill into ~/.agents/skills and ~/.claude/skills', async () => {
		const project = await import('@/utils/project');

		const result = project.materialize(project.userScope(), [{ name: 'triage' }], { copy: false });

		expect(result.written).toEqual(['triage']);
		expect(linked(path.join(home, '.agents/skills'), 'triage')).toBe(true);
		expect(linked(path.join(home, '.claude/skills'), 'triage')).toBe(true);
		expect(fs.readFileSync(path.join(home, '.claude/skills/triage/SKILL.md'), 'utf8')).toBe(
			'# triage\n'
		);
		expect(project.ownedSkills(project.userScope())).toEqual(['triage']);
	});

	it('honours CLAUDE_CONFIG_DIR', async () => {
		const claude = path.join(tmp, 'claude-config');
		vi.stubEnv('CLAUDE_CONFIG_DIR', claude);

		const project = await import('@/utils/project');
		project.materialize(project.userScope(), [{ name: 'triage' }], { copy: false });

		expect(linked(path.join(claude, 'skills'), 'triage')).toBe(true);
		expect(fs.existsSync(path.join(home, '.claude'))).toBe(false);
	});

	it('never touches a skill you made by hand in ~/.claude/skills', async () => {
		const theirs = path.join(home, '.claude/skills/triage');
		fs.mkdirSync(theirs, { recursive: true });
		fs.writeFileSync(path.join(theirs, 'SKILL.md'), '# mine\n');

		const project = await import('@/utils/project');
		const result = project.materialize(project.userScope(), [{ name: 'triage' }], {
			copy: false
		});

		expect(result.skipped).toMatchObject([{ name: 'triage', reason: 'occupied', user: true }]);
		expect(fs.readFileSync(path.join(theirs, 'SKILL.md'), 'utf8')).toBe('# mine\n');
		expect(fs.existsSync(path.join(home, '.agents/skills/triage'))).toBe(false);
	});

	it('unlinks without following the link into the store', async () => {
		const project = await import('@/utils/project');
		project.materialize(project.userScope(), [{ name: 'triage' }], { copy: false });

		expect(project.unmaterialize(project.userScope(), ['triage'])).toEqual(['triage']);
		expect(fs.existsSync(path.join(home, '.agents/skills/triage'))).toBe(false);
		expect(fs.existsSync(path.join(home, '.claude/skills/triage'))).toBe(false);
		expect(fs.existsSync(path.join(store, 'skills/triage/SKILL.md'))).toBe(true);
	});
});

describe('a shared ~/.claude/skills', () => {
	// ~/.claude/skills -> ~/.agents/skills, a common way to share one set of skills
	beforeEach(() => {
		fs.mkdirSync(path.join(home, '.agents/skills'), { recursive: true });
		fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
		fs.symlinkSync(path.join(home, '.agents/skills'), path.join(home, '.claude/skills'), 'dir');
	});

	it('links once, without the claude side clobbering the agents side', async () => {
		const project = await import('@/utils/project');

		const result = project.materialize(project.userScope(), [{ name: 'triage' }], { copy: false });

		expect(result.written).toEqual(['triage']);
		expect(linked(path.join(home, '.agents/skills'), 'triage')).toBe(true);
		expect(fs.readFileSync(path.join(home, '.claude/skills/triage/SKILL.md'), 'utf8')).toBe(
			'# triage\n'
		);
		expect(project.ownedSkills(project.userScope())).toEqual(['triage']);

		// and again, now that it is there
		expect(
			project.materialize(project.userScope(), [{ name: 'triage' }], { copy: false }).written
		).toEqual(['triage']);
		expect(linked(path.join(home, '.agents/skills'), 'triage')).toBe(true);
	});

	it('unlinks cleanly', async () => {
		const project = await import('@/utils/project');
		project.materialize(project.userScope(), [{ name: 'triage' }], { copy: false });

		expect(project.unmaterialize(project.userScope(), ['triage'])).toEqual(['triage']);
		expect(fs.existsSync(path.join(home, '.agents/skills/triage'))).toBe(false);
		expect(fs.lstatSync(path.join(home, '.claude/skills')).isSymbolicLink()).toBe(true);
	});
});

describe('overwrite', () => {
	it('replaces what is in the way with a link', async () => {
		const theirs = path.join(home, '.agents/skills/triage');
		fs.mkdirSync(theirs, { recursive: true });
		fs.writeFileSync(path.join(theirs, 'SKILL.md'), '# mine\n');

		const project = await import('@/utils/project');
		const [skip] = project.materialize(project.userScope(), [{ name: 'triage' }], {
			copy: false
		}).skipped;
		project.overwrite(skip!, { copy: false });

		expect(linked(path.join(home, '.agents/skills'), 'triage')).toBe(true);
		expect(linked(path.join(home, '.claude/skills'), 'triage')).toBe(true);
		expect(fs.readFileSync(path.join(home, '.agents/skills/triage/SKILL.md'), 'utf8')).toBe(
			'# triage\n'
		);
		expect(project.ownedSkills(project.userScope())).toEqual(['triage']);
		// the store itself is untouched
		expect(fs.readFileSync(path.join(store, 'skills/triage/SKILL.md'), 'utf8')).toBe('# triage\n');
	});

	it('replaces a hand made ~/.claude/skills entry too', async () => {
		const theirs = path.join(home, '.claude/skills/triage');
		fs.mkdirSync(theirs, { recursive: true });
		fs.writeFileSync(path.join(theirs, 'SKILL.md'), '# mine\n');

		const project = await import('@/utils/project');
		const [skip] = project.materialize(project.userScope(), [{ name: 'triage' }], {
			copy: false
		}).skipped;
		project.overwrite(skip!, { copy: false });

		expect(linked(path.join(home, '.claude/skills'), 'triage')).toBe(true);
		expect(fs.readFileSync(path.join(theirs, 'SKILL.md'), 'utf8')).toBe('# triage\n');
	});

	it('hides an overwritten project skill from git', async () => {
		const theirs = path.join(repo, '.agents/skills/triage');
		fs.mkdirSync(theirs, { recursive: true });
		fs.writeFileSync(path.join(theirs, 'SKILL.md'), '# mine\n');

		const project = await import('@/utils/project');
		const [skip] = project.materialize(repo, [{ name: 'triage' }], { copy: false }).skipped;
		project.overwrite(skip!, { copy: false });

		expect(linked(path.join(repo, '.agents/skills'), 'triage')).toBe(true);
		expect(git(['status', '--porcelain'])).toBe('');
	});
});

describe('installResolved', () => {
	it('puts bound skills in the project and globals at the user level only', async () => {
		const { installResolved } = await import('@/utils/install');

		const result = await installResolved(repo, [skill('triage', false), skill('review', true)]);

		expect(result.project.written).toEqual(['triage']);
		expect(result.user.written).toEqual(['review']);

		expect(linked(path.join(repo, '.agents/skills'), 'triage')).toBe(true);
		expect(fs.existsSync(path.join(repo, '.agents/skills/review'))).toBe(false);
		expect(linked(path.join(home, '.agents/skills'), 'review')).toBe(true);
		expect(fs.existsSync(path.join(home, '.agents/skills/triage'))).toBe(false);

		expect(git(['status', '--porcelain'])).toBe('');
	});

	it('moves a skill out of the project once it becomes global', async () => {
		const { installResolved } = await import('@/utils/install');

		await installResolved(repo, [skill('triage', false)]);
		const result = await installResolved(repo, [skill('triage', true)]);

		expect(result.project.removed).toEqual(['triage']);
		expect(result.user.added).toEqual(['triage']);
		expect(fs.existsSync(path.join(repo, '.agents/skills/triage'))).toBe(false);
		expect(fs.existsSync(path.join(repo, '.claude/skills/triage'))).toBe(false);
		expect(linked(path.join(home, '.agents/skills'), 'triage')).toBe(true);
	});

	it('moves it back when it stops being global but is still bound', async () => {
		const { installResolved } = await import('@/utils/install');

		await installResolved(repo, [skill('triage', true)]);
		const result = await installResolved(repo, [skill('triage', false)]);

		expect(result.user.removed).toEqual(['triage']);
		expect(result.project.added).toEqual(['triage']);
		expect(fs.existsSync(path.join(home, '.agents/skills/triage'))).toBe(false);
		expect(linked(path.join(repo, '.agents/skills'), 'triage')).toBe(true);
	});

	it('writes real files at the user level in copy mode', async () => {
		const { installResolved } = await import('@/utils/install');

		await installResolved(repo, [skill('review', true)], { copy: true });

		const file = path.join(home, '.agents/skills/review/SKILL.md');
		expect(fs.lstatSync(file).isFile()).toBe(true);
		expect(fs.readFileSync(path.join(home, '.claude/skills/review/SKILL.md'), 'utf8')).toBe(
			'# review\n'
		);
	});
});

describe('linkGlobals', () => {
	it('links from the store and unlinks what is no longer global', async () => {
		const { linkGlobals } = await import('@/utils/install');

		expect(linkGlobals(['triage', 'review']).added).toEqual(['triage', 'review']);

		const result = linkGlobals(['review']);
		expect(result.removed).toEqual(['triage']);
		expect(fs.existsSync(path.join(home, '.agents/skills/triage'))).toBe(false);
		expect(linked(path.join(home, '.agents/skills'), 'review')).toBe(true);
	});

	it('skips a global that is not on this machine yet', async () => {
		const { linkGlobals } = await import('@/utils/install');

		expect(linkGlobals(['nowhere']).written).toEqual([]);
		expect(fs.existsSync(path.join(home, '.agents/skills/nowhere'))).toBe(false);
	});
});
