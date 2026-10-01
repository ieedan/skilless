import { v } from 'convex/values';
import * as model from './model';
import { profileByUsername } from './profiles';
import { query } from './utils';

/*
 * A user's public page, `skilless.dev/skills/<username>` and
 * `skilless.dev/packs/<username>`: everything they have made public.
 */

/** What they have shared, or null when nobody has that username. */
export const page = query({
	args: { username: v.string() },
	handler: async (ctx, args) => {
		const profile = await profileByUsername(ctx, args.username);
		if (!profile) return null;

		const viewer = await ctx.auth.getUserIdentity();
		const [skills, packs, owner, viewerSkills] = await Promise.all([
			model.listSkills(ctx, profile.userId),
			model.listPacks(ctx, profile.userId),
			model.ownerOf(ctx, profile.userId),
			viewer ? model.listSkills(ctx, viewer.subject) : Promise.resolve([])
		]);

		// which of theirs the viewer already has a copy of, by where each copy came from
		const copied = new Set(
			viewerSkills.flatMap((skill) => {
				const address = skill.source ? model.parseAddress(skill.source.url) : null;
				return address?.kind === 'skill' && address.username === profile.username
					? [address.name]
					: [];
			})
		);

		return {
			owner: { ...owner, login: profile.login },
			/** The viewer's own page, where there is nothing to add. */
			mine: viewer?.subject === profile.userId,
			skills: skills
				.filter((skill) => skill.public === true)
				.map((skill) => ({
					name: skill.name,
					title: skill.title ?? null,
					description: skill.description ?? null,
					/** The viewer already has a copy. */
					added: copied.has(skill.name)
				})),
			packs: packs
				.filter((pack) => pack.public === true)
				.map((pack) => ({
					slug: pack.slug,
					name: pack.name,
					description: pack.description ?? null,
					skillCount: pack.skillCount ?? pack.skills.length,
					countPartial: pack.skillCount === undefined || pack.countPartial === true
				}))
		};
	}
});
