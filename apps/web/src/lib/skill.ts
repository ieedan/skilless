import type { SkillFile } from './files';

/**
 * Mirrors `isValidName` / `scaffold` in the CLI (packages/skilless/src/utils/skill.ts).
 *
 * Kept as a copy rather than shared, because the CLI is a published package and
 * the website should not depend on it. If the rules move there, move them here.
 */
const NAME_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

export const MAX_NAME_LENGTH = 64;

export const NAME_RULES =
	'Use lowercase letters, digits, dots, dashes and underscores, starting with a letter or digit.';

export function isValidName(name: string): boolean {
	return name.length <= MAX_NAME_LENGTH && NAME_PATTERN.test(name);
}

/** The starting SKILL.md, byte for byte what `skilless create` writes. */
export function scaffold(name: string, description: string): SkillFile[] {
	return [
		{
			path: 'SKILL.md',
			contents: `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n\nDescribe what this skill does and when an agent should reach for it.\n`
		}
	];
}
