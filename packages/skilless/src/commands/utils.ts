import { Option } from 'commander';
import pc from 'picocolors';
import { z } from 'zod';
import { ApiClient } from '@/utils/api';
import { getApiUrl, getToken } from '@/utils/auth';
import { NotAProjectError, NotAuthenticatedError, SkillessError } from '@/utils/errors';
import * as git from '@/utils/git';
import { log } from '@/utils/prompts';

export const TRACE_ENV_VAR = 'SKILLESS_TRACE';

export const defaultCommandOptionsSchema = z.object({
	cwd: z.string()
});

export const commonOptions = {
	cwd: new Option('--cwd <path>', 'The current working directory.').default(process.cwd()),
	yes: new Option('-y, --yes', 'Skip confirmation prompts.').default(false),
	project: new Option(
		'--project <key>',
		'Override the project key. Defaults to the normalized git remote.'
	)
};

export function parseOptions<T>(schema: z.ZodType<T>, raw: unknown): T {
	const parsed = schema.safeParse(raw);
	if (parsed.success) return parsed.data;

	return error(
		new SkillessError('Invalid options.', {
			suggestion: parsed.error.issues.map((issue) => `  ${issue.message}`).join('\n')
		})
	);
}

export function error(err: Error): never {
	if (process.env[TRACE_ENV_VAR] === '1') {
		console.trace(err);
	} else {
		log.error(pc.red(err.toString()));
	}

	process.exit(1);
}

/** Runs a command, turning any throw into a clean one line failure. */
export async function tryCommand<T>(run: () => Promise<T>): Promise<T> {
	try {
		return await run();
	} catch (e) {
		if (e instanceof SkillessError) return error(e);

		return error(
			new SkillessError(e instanceof Error ? e.message : String(e), {
				suggestion: `Run with ${TRACE_ENV_VAR}=1 for a stack trace.`,
				cause: e
			})
		);
	}
}

export function requireApi(): ApiClient {
	const token = getToken();
	if (!token) throw new NotAuthenticatedError();

	return new ApiClient(token, getApiUrl());
}

/**
 * A project is identified by its git remote, because that is the only thing a
 * cloud agent in a fresh container can work out for itself.
 */
export function requireProjectKey(cwd: string, override?: string): string {
	if (override) return override;

	const key = git.projectKey(cwd);
	if (!key) throw new NotAProjectError();

	return key;
}
