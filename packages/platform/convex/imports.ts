'use node';

import { v } from 'convex/values';
import { internal } from './_generated/api';
import { discoverDirs, skillName } from './discover';
import { env } from '../env.convex';
import { hashFiles, MAX_SKILL_BYTES, readContents, writeSkill } from './files';
import { githubToken } from './github';
import { isGithubKey, parseFrontmatter, type SkillFile } from './model';
import { readBytes, readFiles, readTree, type RepoTree, skillDirs } from './scans';
import { action, requireUser } from './utils';

/*
 * Copying skills out of GitHub repos into your library from the website: what
 * `skilless add <repo>` does, without a clone. Each one remembers where it came
 * from, so `skilless update` keeps it in step like any skill the CLI added.
 */

/** Most skills one call copies. */
const MAX_SKILLS = 50;

/** What `readSkill` in the CLI leaves out of a skill. */
const IGNORED = new Set(['.git', 'node_modules', '.DS_Store', '.skilless.json']);

const pickValidator = v.object({
	/** `github.com/owner/repo`. */
	key: v.string(),
	/** The skill's directory, or null for every skill in the repo. */
	dir: v.union(v.string(), v.null())
});

type Pick = { key: string; dir: string | null };

/** A skill that was not copied, and why. */
type Failed = { key: string; dir: string; name: string | null; reason: string };

/** Your library already has a different skill by this name; copy it with `replace` to swap it in. */
type Conflict = { key: string; dir: string; name: string };

export type ImportResult = {
	/** Copied in, new or replacing yours. */
	added: string[];
	/** Already yours, file for file; now they remember where they came from. */
	unchanged: string[];
	conflicts: Conflict[];
	failed: Failed[];
};

/** The repo's skill directories this pick takes, as `skilless add` would. */
function dirsFor(all: string[], pick: Pick): string[] {
	if (pick.dir === null) return discoverDirs(all, '');
	return all.includes(pick.dir) ? [pick.dir] : [];
}

/** Every file in the skill's directory, by its path inside the skill. */
function skillBlobs(repo: RepoTree, dir: string) {
	const prefix = dir ? `${dir}/` : '';
	return repo.blobs.flatMap((blob) => {
		if (!blob.path.startsWith(prefix)) return [];
		const rel = blob.path.slice(prefix.length);
		if (rel.split('/').some((segment) => IGNORED.has(segment))) return [];
		return [{ ...blob, rel }];
	});
}

/**
 * Copies the picked GitHub skills into your library. A skill you already have
 * with different files is left alone and returned as a conflict, unless its
 * name is in `replace`.
 */
export const fromGithub = action({
	args: { picks: v.array(pickValidator), replace: v.optional(v.array(v.string())) },
	handler: async (ctx, args): Promise<ImportResult> => {
		const userId = await requireUser(ctx);
		const replace = new Set(args.replace ?? []);
		const result: ImportResult = { added: [], unchanged: [], conflicts: [], failed: [] };

		let token: string | null = null;
		try {
			token = await githubToken(ctx, userId);
		} catch {
			// signed in some other way, or the refresh token expired: public repos still work
		}

		const byRepo = new Map<string, Pick[]>();
		for (const pick of args.picks) {
			const key = pick.key.toLowerCase();
			if (!isGithubKey(key) || key.split('/').length !== 3) continue;
			byRepo.set(key, [...(byRepo.get(key) ?? []), { key, dir: pick.dir }]);
		}

		/** Names already taken by this call, so two repos cannot both claim one. */
		const seen = new Set<string>();
		let copied = 0;

		for (const [key, picks] of byRepo) {
			const repo = await readTree(token, key);
			if (!repo) {
				for (const pick of picks) {
					result.failed.push({
						key,
						dir: pick.dir ?? '',
						name: null,
						reason: 'Could not reach this repository'
					});
				}
				continue;
			}

			const all = skillDirs(repo.blobs);
			const dirs = [...new Set(picks.flatMap((pick) => dirsFor(all, pick)))];

			for (const pick of picks) {
				if (pick.dir !== null && !all.includes(pick.dir)) {
					result.failed.push({
						key,
						dir: pick.dir,
						name: null,
						reason: 'No longer in the repository'
					});
				}
			}

			for (const dir of dirs) {
				if (copied >= MAX_SKILLS) {
					result.failed.push({
						key,
						dir,
						name: null,
						reason: `Only ${MAX_SKILLS} skills at a time`
					});
					continue;
				}

				const blobs = skillBlobs(repo, dir);
				const fail = (name: string | null, reason: string) =>
					result.failed.push({ key, dir, name, reason });

				// the tree knows sizes, so an oversized skill is turned away before it is downloaded
				if (blobs.reduce((sum, blob) => sum + blob.size, 0) > MAX_SKILL_BYTES) {
					fail(null, 'Larger than 3MB');
					continue;
				}

				const read = await readFiles(
					repo.token,
					repo.owner,
					repo.name,
					repo.branch,
					blobs.map((blob) => blob.path)
				);

				const files: SkillFile[] = [];
				let problem: string | null = null;
				for (const blob of blobs) {
					let contents = read.get(blob.path);
					if (contents === null) {
						// binary: GitHub's text read gives nothing, so fetch the bytes themselves
						const bytes = await readBytes(
							repo.token,
							repo.owner,
							repo.name,
							repo.branch,
							blob.path
						);
						if (bytes) {
							files.push({
								path: blob.rel,
								contents: Buffer.from(bytes).toString('base64'),
								encoding: 'base64'
							});
							continue;
						}
						contents = undefined;
					}
					if (contents === undefined) problem = `Could not read ${blob.rel}`;
					else files.push({ path: blob.rel, contents });
				}

				const main = files.find((file) => file.path === 'SKILL.md' && !file.encoding);
				const name = skillName(dir, main ? parseFrontmatter(main.contents).title : undefined);

				if (problem) {
					fail(name, problem);
					continue;
				}
				if (seen.has(name)) continue;
				seen.add(name);

				const contentHash = hashFiles(files);
				const source = {
					url: `https://github.com/${repo.owner}/${repo.name}.git`,
					path: dir,
					hash: contentHash
				};

				const snapshot = await ctx.runQuery(internal.skills.snapshot, { userId, name });
				if (snapshot && snapshot.skill.contentHash !== contentHash && !replace.has(name)) {
					result.conflicts.push({ key, dir, name });
					continue;
				}

				try {
					if (snapshot?.skill.contentHash === contentHash) {
						result.unchanged.push(name);
					} else {
						await writeSkill(ctx, { userId, name, editedAt: Date.now(), change: () => files });
						result.added.push(name);
						copied++;
					}
					await ctx.runMutation(internal.skills.setSource, { userId, name, source });
				} catch {
					fail(name, 'Could not save it');
				}
			}
		}

		return result;
	}
});

/** How copying one skilless skill went. */
export type CopyResult =
	| { status: 'added' | 'unchanged'; name: string }
	/** You have a different skill by that name; copy again with `replace` to swap it in. */
	| { status: 'conflict'; name: string }
	| { status: 'missing' }
	/** It is yours already: a skill cannot be copied from itself. */
	| { status: 'own'; name: string };

/**
 * Copies a skill on skilless — public, or your own — into your library, as
 * `skilless add @user/skill` does. It remembers its address, so `skilless
 * update` keeps it in step with the original.
 */
export const fromSkilless = action({
	args: {
		username: v.string(),
		name: v.string(),
		replace: v.optional(v.boolean()),
		/** Counts as an install, as an add does. An update from its source is not one. */
		install: v.optional(v.boolean())
	},
	handler: async (ctx, args): Promise<CopyResult> => {
		const userId = await requireUser(ctx);
		const found = await ctx.runQuery(internal.skills.forCopy, {
			username: args.username,
			name: args.name,
			viewerId: userId
		});
		if (!found) return { status: 'missing' };
		// your own skill is in your library already; copying it would make it its own source
		if (found.mine) return { status: 'own', name: found.name };

		const files = await readContents(found.files);
		const contentHash = hashFiles(files);
		const source = {
			url: `${env.SITE_URL.replace(/\/+$/, '')}/skills/${args.username.toLowerCase()}/${found.name}`,
			path: '',
			hash: contentHash
		};

		const mine = await ctx.runQuery(internal.skills.snapshot, { userId, name: found.name });
		if (mine && mine.skill.contentHash !== contentHash && !args.replace) {
			return { status: 'conflict', name: found.name };
		}

		const unchanged = mine?.skill.contentHash === contentHash;
		if (!unchanged) {
			await writeSkill(ctx, {
				userId,
				name: found.name,
				editedAt: Date.now(),
				change: () => files
			});
		}
		await ctx.runMutation(internal.skills.setSource, { userId, name: found.name, source });
		if (args.install !== false) {
			await ctx.runMutation(internal.installs.record, { kind: 'skill', id: found.id });
		}
		return { status: unchanged ? 'unchanged' : 'added', name: found.name };
	}
});
