export type SkillFile = { path: string; contents: string };

export type Entry =
	| { kind: 'directory'; name: string; path: string; count: number }
	| { kind: 'file'; name: string; path: string };

/**
 * Skills store files as flat paths (`agents/openai.yaml`), but they are browsed
 * as a tree. This turns a flat set into the entries directly inside `prefix`,
 * collapsing anything deeper into a single directory entry.
 *
 * `prefix` is '' for the skill root, otherwise a path with no trailing slash.
 */
export function listDirectory(files: { path: string }[], prefix = ''): Entry[] {
	const head = prefix === '' ? '' : `${prefix}/`;

	const directories = new Map<string, number>();
	const entries: Entry[] = [];

	for (const file of files) {
		if (!file.path.startsWith(head)) continue;

		const rest = file.path.slice(head.length);
		const slash = rest.indexOf('/');

		if (slash === -1) {
			entries.push({ kind: 'file', name: rest, path: file.path });
			continue;
		}

		const name = rest.slice(0, slash);
		directories.set(name, (directories.get(name) ?? 0) + 1);
	}

	const folders: Entry[] = [...directories].map(([name, count]) => {
		// Collapse a chain with nothing to choose at each step — `template` holding
		// only `setup` shows as `template/setup` and lands you where you were
		// headed, the way editors show compact folders.
		let path = `${head}${name}`;
		let label = name;

		for (;;) {
			const inside = listDirectory(files, path);
			if (inside.length !== 1 || inside[0].kind !== 'directory') break;

			path = inside[0].path;
			label = `${label}/${inside[0].name}`;
		}

		return { kind: 'directory', name: label, path, count };
	});

	const byName = (a: Entry, b: Entry) => a.name.localeCompare(b.name);

	// directories first, the way every file browser does it
	return [...folders.sort(byName), ...entries.sort(byName)];
}

/** True when `path` names a directory within the skill rather than a file. */
export function isDirectory(files: { path: string }[], path: string): boolean {
	return files.some((file) => file.path.startsWith(`${path}/`));
}
