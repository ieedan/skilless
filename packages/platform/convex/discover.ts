/*
 * Which skills a repo offers, by the same rules as the CLI's `discoverSkills`
 * (packages/skilless/src/utils/source.ts), but over a list of directories
 * holding a SKILL.md rather than a checkout. Keep the two in step: the website
 * must show the skills `skilless add` will actually take.
 */

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '__pycache__']);

const CONTAINERS = [
	'skills',
	'skills/.curated',
	'skills/.experimental',
	'skills/.system',
	'.agents/skills',
	'.claude/skills'
];

const join = (a: string, b: string) => (a ? (b ? `${a}/${b}` : a) : b);

/**
 * The skill directories under `base` at most `depth` levels down, never inside
 * another skill and never through a skipped directory.
 */
function walk(dirs: Set<string>, base: string, depth: number): string[] {
	const prefix = base ? `${base}/` : '';
	const found: string[] = [];

	for (const dir of dirs) {
		if (dir === base || !dir.startsWith(prefix)) continue;

		const segments = dir.slice(prefix.length).split('/');
		if (segments.length > depth || segments.some((segment) => SKIP_DIRS.has(segment))) continue;

		// a skill inside another skill is part of that one
		const nested = segments
			.slice(0, -1)
			.some((_, i) => dirs.has(join(base, segments.slice(0, i + 1).join('/'))));
		if (!nested) found.push(dir);
	}

	return found.sort((a, b) => a.localeCompare(b));
}

/** The directories `skilless add <repo>/<subpath>` would take skills from. */
export function discoverDirs(all: string[], subpath = ''): string[] {
	const dirs = new Set(all);
	const base = subpath.replace(/^\/+|\/+$/g, '');

	if (dirs.has(base)) return [base];

	const found = new Set<string>();
	for (const dir of walk(dirs, base, 1)) found.add(dir);
	for (const container of CONTAINERS) {
		for (const dir of walk(dirs, join(base, container), 3)) found.add(dir);
	}
	if (found.size === 0) for (const dir of walk(dirs, base, 5)) found.add(dir);

	return [...found];
}

/** A name that survives a library: what the CLI's `isValidName` accepts. Packs are named the same way. */
export function isValidName(name: string): boolean {
	return name.length <= 64 && /^[a-z0-9][a-z0-9._-]*$/.test(name);
}

/** Named by its frontmatter, falling back to its directory, as the CLI does. */
export function skillName(dir: string, declared: string | undefined): string {
	const name = declared?.toLowerCase().replace(/[\s_]+/g, '-');
	if (name && isValidName(name)) return name;
	return (dir.split('/').at(-1) ?? dir).toLowerCase();
}

/** The skills `skilless add <repo>/<subpath>` would take from a scan, one per name. */
export function skillsAt<Skill extends { dir: string; name: string }>(
	skills: Skill[],
	subpath: string
): Skill[] {
	const byDir = new Map(skills.map((skill) => [skill.dir, skill]));
	const seen = new Set<string>();

	return discoverDirs(
		skills.map((skill) => skill.dir),
		subpath
	)
		.map((dir) => byDir.get(dir)!)
		.filter((skill) => !seen.has(skill.name) && seen.add(skill.name))
		.sort((a, b) => a.name.localeCompare(b.name));
}
