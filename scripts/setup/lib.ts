import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { cancel, isCancel, spinner } from '@clack/prompts';
import { detect, resolveCommand } from 'package-manager-detector';

/**
 * `Exclude<T, symbol>` rather than a bare `T`: since @clack/prompts 1.8 the
 * prompts return `string | typeof CANCEL_SYMBOL`, and a `unique symbol` will not
 * subtract out of `T | symbol` during inference — T comes back as the whole
 * union and the assertion narrows to nothing.
 */
export function exitIfCancelled<T>(value: T): asserts value is Exclude<T, symbol> {
	if (isCancel(value)) {
		cancel('Setup cancelled.');
		process.exit(0);
	}
}

export function generateSecret(bytes = 32): string {
	return crypto.randomBytes(bytes).toString('base64');
}

/**
 * Prints outside clack's bar, at column zero.
 *
 * Anything the user has to copy across more than one line has to live here — a
 * selection dragged through a clack box picks up the border and the padding on
 * every line, and has to be cleaned up by hand before it can be pasted.
 */
export function block(content: string): void {
	process.stdout.write(`\n${content}\n\n`);
}

export type Runner = {
	agent: string;
	install: string[];
	run: (script: string, args?: string[]) => string[];
};

export async function detectRunner(cwd: string): Promise<Runner> {
	const detected = await detect({ cwd });
	const agent = detected?.agent ?? 'pnpm';

	const install = resolveCommand(agent, 'install', []);
	if (!install) throw new Error(`Could not work out how to install with ${agent}.`);

	return {
		agent,
		install: [install.command, ...install.args],
		run: (script, args = []) => {
			const resolved = resolveCommand(agent, 'run', [script, ...args]);
			if (!resolved) throw new Error(`Could not work out how to run ${script}.`);
			return [resolved.command, ...resolved.args];
		}
	};
}

export type RunOptions = {
	cwd: string;
	/** Hand the terminal over, for anything that logs you in or asks a question. */
	interactive?: boolean;
	env?: Record<string, string>;
};

export function run(command: string[], opts: RunOptions): string {
	const [bin, ...args] = command;
	if (!bin) throw new Error('No command given.');

	const result = spawnSync(bin, args, {
		cwd: opts.cwd,
		encoding: 'utf8',
		stdio: opts.interactive ? 'inherit' : 'pipe',
		env: { ...process.env, ...opts.env }
	});

	if (result.status !== 0) {
		const detail = opts.interactive ? '' : `\n${result.stderr ?? ''}`.trimEnd();
		throw new Error(`\`${command.join(' ')}\` failed.${detail}`);
	}

	return (result.stdout ?? '').trim();
}

export function tryRun(command: string[], opts: RunOptions): string | null {
	try {
		return run(command, opts);
	} catch {
		return null;
	}
}

export async function task<T>(message: string, fn: () => Promise<T> | T): Promise<T> {
	const s = spinner();
	s.start(message);

	try {
		const result = await fn();
		s.stop(message);
		return result;
	} catch (e) {
		s.stop(message);
		throw e;
	}
}

/* ------------------------------------------------------------------- env */

export function readEnvFile(file: string): Record<string, string> {
	if (!fs.existsSync(file)) return {};

	const values: Record<string, string> = {};

	for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;

		const index = trimmed.indexOf('=');
		if (index === -1) continue;

		const key = trimmed.slice(0, index).trim();
		const raw = trimmed.slice(index + 1).trim();

		values[key] = raw.replace(/^(['"])(.*)\1$/, '$2');
	}

	return values;
}

/** Merges into whatever is already there rather than replacing the file. */
export function writeEnvFile(file: string, values: Record<string, string>): void {
	const merged = { ...readEnvFile(file), ...values };

	const body = Object.entries(merged)
		.map(([key, value]) => `${key}=${quote(value)}`)
		.join('\n');

	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, `${body}\n`, { encoding: 'utf8', mode: 0o600 });
}

function quote(value: string): string {
	return /[\s#"']/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}

export function envBlock(values: Record<string, string>): string {
	return Object.entries(values)
		.map(([key, value]) => `${key}=${value}`)
		.join('\n');
}
