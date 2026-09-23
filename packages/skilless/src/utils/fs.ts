import fs from 'node:fs';
import path from 'pathe';

export function exists(target: string): boolean {
	try {
		fs.lstatSync(target);
		return true;
	} catch {
		return false;
	}
}

export function isSymlink(target: string): boolean {
	try {
		return fs.lstatSync(target).isSymbolicLink();
	} catch {
		return false;
	}
}

/** True for a symlink whose target no longer exists. */
export function isDangling(target: string): boolean {
	if (!isSymlink(target)) return false;
	return !fs.existsSync(target);
}

export function ensureDir(dir: string): void {
	fs.mkdirSync(dir, { recursive: true });
}

/** Removes a link without ever following it into what it points at. */
export function remove(target: string): void {
	if (!exists(target)) return;

	if (isSymlink(target)) {
		try {
			fs.unlinkSync(target);
		} catch {
			// a directory symlink or junction on Windows has to go as a directory
			fs.rmdirSync(target);
		}
		return;
	}

	fs.rmSync(target, { recursive: true, force: true });
}

/** Every file under `dir`, as paths relative to it, depth first and sorted. */
export function walk(dir: string, ignore: (name: string) => boolean): string[] {
	const out: string[] = [];

	const visit = (current: string, prefix: string) => {
		const entries = fs.readdirSync(current, { withFileTypes: true });

		for (const entry of entries) {
			if (ignore(entry.name)) continue;

			const rel = prefix ? path.join(prefix, entry.name) : entry.name;
			const abs = path.join(current, entry.name);

			if (entry.isDirectory()) visit(abs, rel);
			else if (entry.isFile()) out.push(rel);
		}
	};

	visit(dir, '');
	return out.sort();
}

export function writeFile(target: string, contents: string): void {
	ensureDir(path.dirname(target));
	fs.writeFileSync(target, contents, 'utf8');
}

export function readJson<T>(target: string, fallback: T): T {
	try {
		return JSON.parse(fs.readFileSync(target, 'utf8')) as T;
	} catch {
		return fallback;
	}
}

export function writeJson(target: string, value: unknown, mode?: number): void {
	ensureDir(path.dirname(target));
	fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode });
}

/** Copies a directory tree, following no symlinks. */
export function copyDir(from: string, to: string): void {
	ensureDir(to);
	fs.cpSync(from, to, { recursive: true, dereference: true });
}
