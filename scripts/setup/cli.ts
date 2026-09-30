#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cancel, confirm, intro, isCancel, log, outro } from '@clack/prompts';
import dotenvx from '@dotenvx/dotenvx';
import { Command, Option, program } from 'commander';
import { z } from 'zod';
import { devSteps, prodSteps, type SetupMode, type Step, type StepContext } from './steps';

const commonOptions = {
	fresh: new Option('-f, --fresh', 'Ignore any existing setup and start from scratch.'),
	cwd: new Option('--cwd <path>', 'The path to the project directory.').default(process.cwd())
};

const setupSchema = z.object({
	fresh: z.boolean().default(false),
	cwd: z.string().default(process.cwd())
});

type SetupOptions = z.infer<typeof setupSchema>;

const draftSchema = z.object({
	mode: z.enum(['dev', 'prod']),
	step: z.string(),
	data: z.record(z.string(), z.unknown()).default({})
});

type Draft = z.infer<typeof draftSchema>;

/** Beside this file, so the `.gitignore` next to it covers the drafts. */
const TEMP_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '.temp');

class DraftManager {
	constructor(private mode: SetupMode) {}

	path() {
		return path.join(TEMP_DIR, `setup-${this.mode}.json`);
	}

	read(): Draft | null {
		const file = this.path();
		if (!fs.existsSync(file)) return null;

		try {
			const parsed = draftSchema.parse(JSON.parse(fs.readFileSync(file, 'utf8')));
			return parsed.mode === this.mode ? parsed : null;
		} catch {
			fs.rmSync(file, { force: true });
			return null;
		}
	}

	write(draft: Draft) {
		const file = this.path();
		fs.mkdirSync(path.dirname(file), { recursive: true });
		// 0600: a half-finished run holds whatever the steps have collected, which
		// is usually the same secrets the .env will.
		fs.writeFileSync(file, `${JSON.stringify(draft, null, '\t')}\n`, { mode: 0o600 });
	}

	discard() {
		fs.rmSync(this.path(), { force: true });
	}
}

function exitIfCancelled<T>(value: T | symbol): asserts value is T {
	if (isCancel(value)) {
		cancel('Setup cancelled.');
		process.exit(0);
	}
}

async function prepareEnvironment(
	args: unknown
): Promise<{ env: Record<string, Record<string, string>> | null; options: SetupOptions }> {
	const options = setupSchema.parse(args);

	if (options.fresh) return { options, env: null };

	const envs = await dotenvx.ls(options.cwd, ['.env', '.env.*'], []);

	const env: Record<string, Record<string, string>> = {};
	for (const envFile of envs) {
		// `ls` reports paths relative to `cwd`; reading one without resolving it
		// against `cwd` again would quietly load the calling directory's file.
		const result = dotenvx.parse(fs.readFileSync(path.resolve(options.cwd, envFile), 'utf8'));
		env[envFile] = result;
	}

	return { options, env };
}

async function resolveDraft(
	drafts: DraftManager,
	options: SetupOptions,
	steps: Step[]
): Promise<{ startIndex: number; data: Record<string, unknown> }> {
	if (options.fresh) {
		drafts.discard();
		return { startIndex: 0, data: {} };
	}

	const draft = drafts.read();
	if (!draft) return { startIndex: 0, data: {} };

	const startIndex = steps.findIndex((step) => step.name === draft.step);
	if (startIndex === -1) {
		drafts.discard();
		return { startIndex: 0, data: {} };
	}

	const resume = await confirm({
		message: `Would you like to resume your setup from step: ${draft.step}`
	});
	exitIfCancelled(resume);

	if (!resume) {
		drafts.discard();
		return { startIndex: 0, data: {} };
	}

	return { startIndex, data: draft.data };
}

async function runSetup(mode: SetupMode, rawOptions: unknown, steps: Step[]) {
	intro(`skilless setup · ${mode}`);

	const { options, env } = await prepareEnvironment(rawOptions);
	const drafts = new DraftManager(mode);
	const { startIndex, data } = await resolveDraft(drafts, options, steps);
	const ctx: StepContext = { options, env, mode, data };

	for (let i = startIndex; i < steps.length; i++) {
		const step = steps[i];
		if (!step) continue;

		drafts.write({ mode, step: step.name, data: ctx.data });

		try {
			await step.run(ctx);
		} catch (e) {
			log.error(e instanceof Error ? e.message : String(e));
			// the draft stays on disk, so the next run offers to pick up here
			cancel(`Stopped at ${step.name}. Run the same command again to resume.`);
			process.exit(1);
		}
	}

	drafts.discard();
	outro('Done.');
}

function command(mode: SetupMode, description: string, steps: Step[]) {
	return new Command(mode)
		.description(description)
		.addOption(commonOptions.fresh)
		.addOption(commonOptions.cwd)
		.action(async (rawOptions) => {
			await runSetup(mode, rawOptions, steps);
		});
}

const cli = program
	.name('setup')
	.description('Set skilless up for development or production.')
	.addCommand(command('dev', 'Set this project up for development.', devSteps))
	.addCommand(command('prod', 'Set this project up for production.', prodSteps));

cli.parse();
