import enquirer from 'enquirer';
import pc from 'picocolors';

type PromptFn = <T>(options: unknown) => Promise<T>;

const ask = (enquirer as unknown as { prompt: PromptFn }).prompt;

/** Enquirer rejects with an empty value when the user hits ctrl-c. */
async function run<T>(options: unknown, fallback: T): Promise<T> {
	try {
		return await ask<T>(options);
	} catch {
		cancel();
		return fallback;
	}
}

export function cancel(): never {
	process.stdout.write(`${pc.red('✖')} Cancelled\n`);
	process.exit(1);
}

export async function confirm(message: string, initial = false): Promise<boolean> {
	const answer = await run<{ value: boolean }>(
		{ type: 'confirm', name: 'value', message, initial },
		{ value: false }
	);

	return answer.value;
}

export const isInteractive = Boolean(process.stdin.isTTY && process.stdout.isTTY);

export type InputOptions = {
	initial?: string;
	/** Return `true` to accept, or the message explaining why not. */
	validate?: (value: string) => true | string;
};

export async function input(message: string, opts: InputOptions = {}): Promise<string> {
	const answer = await run<{ value: string }>(
		{
			type: 'input',
			name: 'value',
			message,
			initial: opts.initial,
			validate: opts.validate ? (value: string) => opts.validate!((value ?? '').trim()) : undefined
		},
		{ value: '' }
	);

	return answer.value.trim();
}

export async function multiselect(
	message: string,
	choices: { name: string; hint?: string }[]
): Promise<string[]> {
	if (choices.length === 0) return [];

	const answer = await run<{ value: string[] }>(
		{ type: 'multiselect', name: 'value', message, choices },
		{ value: [] }
	);

	return answer.value;
}

export const log = {
	intro(version: string) {
		process.stdout.write(`${pc.bgWhite(pc.black(' skilless '))}${pc.gray(` v${version}`)}\n\n`);
	},
	info(message: string) {
		process.stdout.write(`${pc.blue('·')} ${message}\n`);
	},
	step(message: string) {
		process.stdout.write(`${pc.green('✓')} ${message}\n`);
	},
	warn(message: string) {
		process.stdout.write(`${pc.yellow('!')} ${message}\n`);
	},
	error(message: string) {
		process.stderr.write(`${pc.red('✖')} ${message}\n`);
	},
	dim(message: string) {
		process.stdout.write(`${pc.gray(message)}\n`);
	},
	blank() {
		process.stdout.write('\n');
	}
};
