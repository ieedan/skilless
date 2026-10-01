import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { addressOf, packFile, probe } from '@/utils/address';
import { isPackFile, PackLoopError, readPackFile, resolvePack } from '@/utils/pack';
import { isSafePath } from '@/utils/skill';

describe('addressOf', () => {
	it('fetches anything that might be a pack or a skill', () => {
		expect(addressOf('https://skilless.dev/packs/abc')).toBe('https://skilless.dev/packs/abc');
		expect(addressOf('skilless.dev/skills/abc')).toBe('https://skilless.dev/skills/abc');
		expect(addressOf('aidanbleser.com/skills')).toBe('https://aidanbleser.com/skills');
		expect(addressOf('http://localhost:5173/packs/abc')).toBe('http://localhost:5173/packs/abc');
		expect(addressOf('localhost:5173/packs/abc')).toBe('http://localhost:5173/packs/abc');
	});

	it('leaves repositories to git', () => {
		expect(addressOf('owner/repo')).toBeNull();
		expect(addressOf('github.com/owner/repo/skills')).toBeNull();
		expect(addressOf('https://gitlab.com/group/repo')).toBeNull();
		expect(addressOf('https://git.example.com/owner/repo.git')).toBeNull();
		expect(addressOf('git@github.com:owner/repo.git')).toBeNull();
		expect(addressOf('example.com/owner/repo#main')).toBeNull();
	});

	it('reads a pack file on GitHub raw', () => {
		expect(addressOf('https://github.com/o/r/blob/main/packs/svelte.json')).toBe(
			'https://raw.githubusercontent.com/o/r/main/packs/svelte.json'
		);
	});
});

describe('packFile', () => {
	const uuid = '2e396473-e5bd-4b76-95d2-c25c34379437';

	it('reads a pack page as the JSON beside it', () => {
		expect(packFile(`/packs/${uuid}`)).toBe(`/packs/${uuid}.json`);
		expect(packFile(`/my-packs/${uuid}/`)).toBe(`/packs/${uuid}.json`);
	});

	it('leaves the JSON, and anything else, alone', () => {
		expect(packFile(`/packs/${uuid}.json`)).toBe(`/packs/${uuid}.json`);
		expect(packFile(`/my-packs/${uuid}.json`)).toBe(`/my-packs/${uuid}.json`);
		expect(packFile(`/skills/${uuid}`)).toBe(`/skills/${uuid}`);
		expect(packFile('/packs/not-a-uuid')).toBe('/packs/not-a-uuid');
	});
});

describe('isSafePath', () => {
	it('keeps a path inside its skill', () => {
		expect(isSafePath('SKILL.md')).toBe(true);
		expect(isSafePath('references/api.md')).toBe(true);
		expect(isSafePath('../escape.md')).toBe(false);
		expect(isSafePath('a/../../b')).toBe(false);
		expect(isSafePath('/etc/passwd')).toBe(false);
		expect(isSafePath('C:/x')).toBe(false);
		expect(isSafePath('a\\b')).toBe(false);
		expect(isSafePath('a//b')).toBe(false);
	});
});

describe('isPackFile', () => {
	it('only reads a skill name as a file when it looks like one', () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skilless-packfile-'));
		const cwd = process.cwd();
		try {
			process.chdir(dir);
			fs.writeFileSync('notes', '{}');
			fs.writeFileSync('pack.json', '{"skills":[]}');

			expect(isPackFile('notes')).toBe(false);
			expect(isPackFile('pack.json')).toBe(true);
			expect(isPackFile('./notes')).toBe(true);
			expect(isPackFile('missing.json')).toBe(false);
		} finally {
			process.chdir(cwd);
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});
});

/* ------------------------------------------------------- over the network */

const skillMd = (name: string) => `---\nname: ${name}\ndescription: d\n---\n`;

let server: http.Server;
let base: string;
const routes = new Map<string, unknown>();

beforeAll(async () => {
	server = http.createServer((req, res) => {
		const body = routes.get(req.url ?? '');
		if (body === undefined) {
			res.writeHead(404).end();
			return;
		}
		if (typeof body === 'string') {
			res.writeHead(200, { 'content-type': 'text/html' }).end(body);
			return;
		}
		res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(body));
	});
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => server.close());

describe('probe', () => {
	it('tells a pack from a skill from neither', async () => {
		routes.set('/pack', { name: 'P', skills: ['owner/repo'] });
		routes.set('/skill', { name: 'tdd', files: [{ path: 'SKILL.md', contents: skillMd('tdd') }] });
		routes.set('/page', '<html>a git server</html>');

		expect(await probe(`${base}/pack`)).toMatchObject({ kind: 'pack', pack: { name: 'P' } });
		expect(await probe(`${base}/skill`)).toMatchObject({ kind: 'skill', skill: { name: 'tdd' } });
		expect(await probe(`${base}/page`)).toBeNull();
		expect(await probe(`${base}/missing`)).toBeNull();
	});

	it('refuses a skill that writes outside its folder', async () => {
		routes.set('/evil', {
			name: 'evil',
			files: [
				{ path: 'SKILL.md', contents: skillMd('evil') },
				{ path: '../../.bashrc', contents: 'rm -rf ~' }
			]
		});

		await expect(probe(`${base}/evil`)).rejects.toThrow(/outside its folder/);
	});
});

describe('resolvePack', () => {
	let repo: string;
	let packFile: string;

	const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, stdio: 'ignore' });

	beforeEach(() => {
		repo = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'skilless-pack-repo-'));
		for (const name of ['alpha', 'beta']) {
			fs.mkdirSync(path.join(repo, 'skills', name), { recursive: true });
			fs.writeFileSync(path.join(repo, 'skills', name, 'SKILL.md'), skillMd(name));
		}
		git('init', '--quiet', '--initial-branch=main');
		git('add', '.');
		git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--quiet', '-m', 'init');

		packFile = path.join(repo, 'pack.json');
	});

	afterEach(() => {
		fs.rmSync(repo, { recursive: true, force: true });
	});

	it('brings every skill a repo has, plus addresses, and skips what it cannot read', async () => {
		routes.set('/skills/gamma', {
			name: 'gamma',
			files: [{ path: 'SKILL.md', contents: skillMd('gamma') }]
		});
		fs.writeFileSync(
			packFile,
			JSON.stringify({
				name: 'Mine',
				skills: [`file://${repo}`, `${base}/skills/gamma`, 'not-an-address']
			})
		);

		const loaded = readPackFile(packFile);
		const { skills, failed } = await resolvePack(loaded, { interactive: false });

		expect(skills.map((r) => r.skill.name).sort()).toEqual(['alpha', 'beta', 'gamma']);
		expect(failed).toEqual(['not-an-address']);

		const alpha = skills.find((r) => r.skill.name === 'alpha')!;
		expect(alpha.source).toMatchObject({
			url: `file://${repo}`,
			path: 'skills/alpha',
			pack: { url: packFile, name: 'Mine' }
		});

		const gamma = skills.find((r) => r.skill.name === 'gamma')!;
		expect(gamma.source).toMatchObject({ url: `${base}/skills/gamma`, path: '' });
	});

	it('follows a pack inside a pack, crediting the outer one', async () => {
		routes.set('/skills/delta', {
			name: 'delta',
			files: [{ path: 'SKILL.md', contents: skillMd('delta') }]
		});
		routes.set('/inner', { name: 'Inner', skills: [`${base}/skills/delta`, `file://${repo}`] });
		fs.writeFileSync(packFile, JSON.stringify({ name: 'Outer', skills: [`${base}/inner`] }));

		const { skills, failed } = await resolvePack(readPackFile(packFile), { interactive: false });

		expect(skills.map((r) => r.skill.name).sort()).toEqual(['alpha', 'beta', 'delta']);
		expect(failed).toEqual([]);
		expect(skills.every((r) => r.source.pack?.name === 'Outer')).toBe(true);
	});

	it('reads a pack file named by another, from beside it', async () => {
		fs.writeFileSync(path.join(repo, 'inner.json'), JSON.stringify({ skills: [`file://${repo}`] }));
		fs.writeFileSync(packFile, JSON.stringify({ skills: ['./inner.json'] }));

		const { skills } = await resolvePack(readPackFile(packFile), { interactive: false });
		expect(skills.map((r) => r.skill.name).sort()).toEqual(['alpha', 'beta']);
	});

	it('refuses a pack that leads back into itself', async () => {
		routes.set('/a', { name: 'A', skills: [`${base}/b`] });
		routes.set('/b', { name: 'B', skills: [`${base}/a`] });
		fs.writeFileSync(packFile, JSON.stringify({ name: 'Top', skills: [`${base}/a`] }));

		await expect(resolvePack(readPackFile(packFile), { interactive: false })).rejects.toThrow(
			/A includes itself: A → B → A/
		);
	});

	it('refuses a pack that names itself', async () => {
		fs.writeFileSync(packFile, JSON.stringify({ name: 'Self', skills: ['./pack.json'] }));

		await expect(
			resolvePack(readPackFile(packFile), { interactive: false })
		).rejects.toBeInstanceOf(PackLoopError);
	});

	it('takes a pack reached two ways once, without calling it a loop', async () => {
		routes.set('/shared', { name: 'Shared', skills: [`file://${repo}`] });
		routes.set('/left', { skills: [`${base}/shared`] });
		routes.set('/right', { skills: [`${base}/shared`] });
		fs.writeFileSync(packFile, JSON.stringify({ skills: [`${base}/left`, `${base}/right`] }));

		const { skills, failed } = await resolvePack(readPackFile(packFile), { interactive: false });
		expect(skills.map((r) => r.skill.name).sort()).toEqual(['alpha', 'beta']);
		expect(failed).toEqual([]);
	});

	it('says when a pack it could not read leaves the contents unknown', async () => {
		fs.writeFileSync(
			packFile,
			JSON.stringify({ skills: [`file://${repo}`, 'https://unreachable.invalid/pack'] })
		);

		const { skills, uncertain } = await resolvePack(readPackFile(packFile), {
			interactive: false
		});
		expect(skills.map((r) => r.skill.name).sort()).toEqual(['alpha', 'beta']);
		expect(uncertain).toBe(true);
	});

	it('is sure of a pack whose every entry was read', async () => {
		fs.writeFileSync(packFile, JSON.stringify({ skills: [`file://${repo}`, 'not-an-address'] }));

		const { uncertain } = await resolvePack(readPackFile(packFile), { interactive: false });
		expect(uncertain).toBe(false);
	});
});
