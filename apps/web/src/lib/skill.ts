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

/**
 * Badges for the frontmatter fields every major agent understands, read from
 * the `metadata` the platform stores on the skill row (every field but `name`
 * and `description`).
 */
export function skillBadges(metadata: Record<string, unknown> | undefined) {
	const fields = metadata ?? {};
	const text = (value: unknown) =>
		typeof value === 'string' || typeof value === 'number' ? String(value).trim() : undefined;

	// the spec has it space separated; some write it as a YAML list
	const tools = fields['allowed-tools'];
	const allowedTools = Array.isArray(tools)
		? tools.map(String)
		: (text(tools)?.split(/\s+/).filter(Boolean) ?? []);

	const version = text((fields.metadata as Record<string, unknown> | undefined)?.version);

	return {
		modelInvocable: fields['disable-model-invocation'] !== true,
		version: version?.replace(/^v/, ''),
		license: text(fields.license),
		allowedTools
	};
}
