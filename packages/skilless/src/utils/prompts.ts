import enquirer from 'enquirer';
import ora, { type Ora } from 'ora';
import pc from 'picocolors';

type PromptFn = <T>(options: unknown) => Promise<T>;

const ask = (enquirer as unknown as { prompt: PromptFn }).prompt;

/**
 * Replaces enquirer's own cancel. On ctrl-c, Node closes the readline itself,
 * and enquirer 2.4.1 then pauses it during teardown — which throws from inside
 * its keypress queue, where nothing can catch it. Wipe the prompt and leave
 * before enquirer tears anything down.
 */
function onCancel(): void {
	// enquirer parks the cursor on the prompt's first line after every render,
	// so this erases exactly the prompt — its own clear() reaches further up
	process.stdout.write('\r\x1b[0J');
	if (process.stdin.isTTY) process.stdin.setRawMode(false);
	cancel();
}

/** The parts of enquirer's list prompts the scrolling below touches. */
type ListPrompt = {
	index: number;
	choices: { index: number }[];
	visible: { index: number }[];
	render: () => unknown;
	scrollUp: () => unknown;
	scrollDown: () => unknown;
};

/**
 * Enquirer scrolls a long list by rotating it, so moving past either end wraps
 * around to the other. These stop at the ends instead. Each choice keeps its
 * original position in `index`, which is how we know an end is showing.
 */
const list = {
	limit: 10,
	up(this: ListPrompt) {
		if (this.index > 0) {
			this.index--;
			return this.render();
		}

		if (this.choices[0]?.index === 0) return;
		return this.scrollUp();
	},
	down(this: ListPrompt) {
		if (this.index < this.visible.length - 1) {
			this.index++;
			return this.render();
		}

		if (this.visible.at(-1)?.index === this.choices.length - 1) return;
		return this.scrollDown();
	}
};

/** Enquirer rejects with an empty value when the user hits ctrl-c. */
async function run<T>(options: object, fallback: T): Promise<T> {
	// a prompt needs the line the spinner is drawing on
	pauseSpinner();

	try {
		return await ask<T>({ ...options, cancel: onCancel });
	} catch {
		cancel();
		return fallback;
	} finally {
		resumeSpinner();
	}
}

export function cancel(): never {
	pauseSpinner();
	process.stdout.write(`${pc.yellow('!')} Cancelled\n`);
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
	/** A `disabled` choice is shown dimmed, with the reason beside it, and cannot be picked. */
	choices: { name: string; hint?: string; disabled?: string }[]
): Promise<string[]> {
	if (choices.every((choice) => choice.disabled)) return [];

	const answer = await run<{ value: string[] }>(
		{ type: 'multiselect', name: 'value', message, choices, ...list },
		{ value: [] }
	);

	return answer.value;
}

export async function select(
	message: string,
	choices: { name: string; message?: string; hint?: string }[],
	initial?: string
): Promise<string> {
	const index = initial ? choices.findIndex((choice) => choice.name === initial) : -1;

	const answer = await run<{ value: string }>(
		{
			type: 'select',
			name: 'value',
			message,
			choices,
			initial: index === -1 ? 0 : index,
			...list
		},
		{ value: '' }
	);

	return answer.value;
}

/* ---------------------------------------------------------------- spinner */

type Spinner = { ora: Ora; message: string; step: number; dots: NodeJS.Timeout };

let spinner: Spinner | null = null;

/** The message with its trailing dots, which count up from one to three. */
function label(active: Spinner): string {
	const count = (active.step % 3) + 1;
	return `${active.message}${'.'.repeat(count)}${' '.repeat(3 - count)}`;
}

function pauseSpinner(): void {
	if (spinner?.ora.isSpinning) spinner.ora.stop();
}

function resumeSpinner(): void {
	if (spinner && !spinner.ora.isSpinning) spinner.ora.start(label(spinner));
}

/**
 * Shows a spinner while `run` works, so a wait on the network or a clone never
 * looks like a hang. Anything logged or prompted meanwhile takes the line and
 * the spinner picks up again below it. Nested calls just swap the message.
 * Draws nothing when stdout is not a terminal.
 */
export async function spin<T>(message: string, run: () => Promise<T>): Promise<T> {
	// a terminal with no width would have ora redraw hundreds of phantom lines
	if (!process.stdout.isTTY || !process.stdout.columns) return run();

	if (spinner) {
		const previous = spinner.message;
		spinner.message = message;
		try {
			return await run();
		} finally {
			if (spinner) spinner.message = previous;
		}
	}

	const active: Spinner = {
		// enquirer owns stdin whenever a prompt interrupts the spinner
		ora: ora({ stream: process.stdout, color: 'cyan', discardStdin: false }),
		message,
		step: 0,
		dots: setInterval(() => {
			active.step++;
			active.ora.text = label(active);
		}, 300)
	};

	spinner = active;
	resumeSpinner();

	try {
		return await run();
	} finally {
		clearInterval(active.dots);
		pauseSpinner();
		spinner = null;
	}
}

/** Writes a line, clearing the spinner off it first and redrawing it after. */
function write(stream: NodeJS.WriteStream, text: string): void {
	const spinning = spinner?.ora.isSpinning === true;
	if (spinning) spinner!.ora.clear();
	stream.write(text);
	if (spinning) spinner!.ora.render();
}

/** The web app's `--primary` / `--primary-foreground` (apps/web/src/routes/layout.css), as 24-bit colour. */
const brand = (text: string): string =>
	pc.isColorSupported ? `\x1b[48;2;95;95;95m\x1b[38;2;250;250;250m${text}\x1b[39m\x1b[49m` : text;

export const log = {
	intro(version: string) {
		write(process.stdout, `${brand(' skilless ')}${pc.gray(` v${version}`)}\n\n`);
	},
	info(message: string) {
		write(process.stdout, `${pc.blue('·')} ${message}\n`);
	},
	step(message: string) {
		write(process.stdout, `${pc.green('✓')} ${message}\n`);
	},
	warn(message: string) {
		write(process.stdout, `${pc.yellow('!')} ${message}\n`);
	},
	error(message: string) {
		write(process.stderr, `${pc.red('✖')} ${message}\n`);
	},
	dim(message: string) {
		write(process.stdout, `${pc.gray(message)}\n`);
	},
	blank() {
		write(process.stdout, '\n');
	}
};
