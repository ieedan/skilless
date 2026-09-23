import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { confirm, log, note, password, text } from '@clack/prompts';
import {
	block,
	detectRunner,
	exitIfCancelled,
	generateSecret,
	readEnvFile,
	run,
	task,
	tryRun,
	writeEnvFile
} from './lib';

export type SetupMode = 'dev' | 'prod' | 'preview';

export type StepContext = {
	options: { fresh: boolean; cwd: string };
	env: Record<string, Record<string, string>> | null;
	mode: SetupMode;
	data: Record<string, unknown>;
};

export type Step = {
	name: string;
	run: (ctx: StepContext) => Promise<void>;
};

const PLATFORM = 'packages/platform';

/** Convex serves HTTP actions from a sibling host, not the client URL. */
function siteUrlFrom(cloudUrl: string): string {
	return cloudUrl.replace('.convex.cloud', '.convex.site');
}
const DEV_URL = 'http://localhost:5173';

function platformDir(ctx: StepContext): string {
	return path.join(ctx.options.cwd, PLATFORM);
}

function envFile(ctx: StepContext): string {
	return path.join(ctx.options.cwd, '.env.local');
}

function remember(ctx: StepContext, key: string, value: string): void {
	ctx.data[key] = value;
}

function recall(ctx: StepContext, key: string): string | undefined {
	const value = ctx.data[key];
	return typeof value === 'string' ? value : undefined;
}

/** Whatever we already know, from a previous run or a half-finished one. */
function existing(ctx: StepContext, key: string): string | undefined {
	return recall(ctx, key) || readEnvFile(envFile(ctx))[key] || undefined;
}

/* ------------------------------------------------------------ shared steps */

const dependencies: Step = {
	name: 'dependencies',
	run: async (ctx) => {
		const runner = await detectRunner(ctx.options.cwd);

		if (fs.existsSync(path.join(ctx.options.cwd, 'node_modules')) && !ctx.options.fresh) {
			log.step('Dependencies are already installed.');
			return;
		}

		await task(`Installing dependencies with ${runner.agent}`, () =>
			run(runner.install, { cwd: ctx.options.cwd })
		);
	}
};

const GITHUB_KEYS = ['GITHUB_APP_SLUG', 'GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'];

/**
 * A GitHub App rather than an OAuth app: its user tokens can list and clone the
 * repos a user installs it on, private ones included.
 */
function githubApp(ctx: StepContext, siteUrl: string, label: string): Promise<void> {
	return (async () => {
		if (GITHUB_KEYS.every((key) => existing(ctx, key))) {
			const reuse = await confirm({ message: `Reuse the saved ${label} GitHub App?` });
			exitIfCancelled(reuse);

			if (reuse) {
				for (const key of GITHUB_KEYS) remember(ctx, key, existing(ctx, key) as string);
				return;
			}
		}

		note(
			`https://github.com/settings/apps/new\n\nSign in is GitHub only, so this is what creates accounts.`,
			`Create a ${label} GitHub App`
		);

		block(
			[
				'    GitHub App name                      skilless, or anything unique',
				`    Homepage URL                         ${siteUrl}`,
				`    Callback URL                         ${siteUrl}/api/auth/callback/github`,
				'    Expire user authorization tokens     checked',
				'    Request user authorization (OAuth)',
				'      during installation                checked',
				'    Webhook → Active                     unchecked',
				'',
				'    Repository permissions',
				'      Contents                           Read-only',
				'      Metadata                           Read-only',
				'    Account permissions',
				'      Email addresses                    Read-only',
				'',
				'    Where can this GitHub App be installed?  Any account'
			].join('\n')
		);

		log.message(
			'Create the app. The Client ID is on the next page — generate a client secret there too. The slug is the last part of the public link, github.com/apps/<slug>.'
		);

		const slug = await text({
			message: 'GITHUB_APP_SLUG',
			placeholder: 'skilless',
			validate: (value) => (value?.trim() ? undefined : 'Required.')
		});
		exitIfCancelled(slug);

		const clientId = await text({
			message: 'GITHUB_CLIENT_ID',
			placeholder: 'Iv23li…',
			validate: (value) => (value?.trim() ? undefined : 'Required.')
		});
		exitIfCancelled(clientId);

		const clientSecret = await password({
			message: 'GITHUB_CLIENT_SECRET',
			validate: (value) => (value?.trim() ? undefined : 'Required.')
		});
		exitIfCancelled(clientSecret);

		remember(ctx, 'GITHUB_APP_SLUG', slug.trim());
		remember(ctx, 'GITHUB_CLIENT_ID', clientId.trim());
		remember(ctx, 'GITHUB_CLIENT_SECRET', clientSecret.trim());
	})();
}

const R2_KEYS = [
	'R2_BUCKET',
	'R2_ENDPOINT',
	'R2_ACCESS_KEY_ID',
	'R2_SECRET_ACCESS_KEY',
	'R2_PUBLIC_URL'
];

/** Skill file contents live in R2, so every deployment needs a bucket of its own. */
function r2Bucket(ctx: StepContext, label: string): Promise<void> {
	return (async () => {
		if (R2_KEYS.every((key) => existing(ctx, key))) {
			const reuse = await confirm({ message: `Reuse the saved ${label} R2 bucket?` });
			exitIfCancelled(reuse);

			if (reuse) {
				for (const key of R2_KEYS) remember(ctx, key, existing(ctx, key) as string);
				return;
			}
		}

		note(
			[
				'https://dash.cloudflare.com → R2 Object Storage',
				'',
				`1. Create a bucket for ${label}, e.g. skilless-${label === 'development' ? 'dev' : 'prod'}.`,
				'2. Manage R2 API Tokens → Create API Token, with Object Read & Write',
				'   scoped to that bucket.',
				'3. Bucket → Settings → Public Development URL → Enable, and copy it.',
				'   Files are read from it by unguessable URL, so the bucket is public.',
				'',
				'No CORS policy is needed — browsers never talk to the bucket directly.'
			].join('\n'),
			`Create a ${label} R2 bucket`
		);

		const bucket = await text({
			message: 'R2_BUCKET',
			placeholder: `skilless-${label === 'development' ? 'dev' : 'prod'}`,
			initialValue: recall(ctx, 'R2_BUCKET'),
			validate: (value) => (value?.trim() ? undefined : 'Required.')
		});
		exitIfCancelled(bucket);

		const endpoint = await text({
			message: 'R2_ENDPOINT',
			placeholder: 'https://<account id>.r2.cloudflarestorage.com',
			initialValue: recall(ctx, 'R2_ENDPOINT'),
			validate: (value) =>
				value?.trim().startsWith('https://') ? undefined : 'Must start with https://.'
		});
		exitIfCancelled(endpoint);

		const accessKeyId = await text({
			message: 'R2_ACCESS_KEY_ID',
			validate: (value) => (value?.trim() ? undefined : 'Required.')
		});
		exitIfCancelled(accessKeyId);

		const secretAccessKey = await password({
			message: 'R2_SECRET_ACCESS_KEY',
			validate: (value) => (value?.trim() ? undefined : 'Required.')
		});
		exitIfCancelled(secretAccessKey);

		const publicUrl = await text({
			message: 'R2_PUBLIC_URL',
			placeholder: 'https://pub-<hash>.r2.dev',
			initialValue: recall(ctx, 'R2_PUBLIC_URL'),
			validate: (value) =>
				value?.trim().startsWith('https://') ? undefined : 'Must start with https://.'
		});
		exitIfCancelled(publicUrl);

		remember(ctx, 'R2_BUCKET', bucket.trim());
		remember(ctx, 'R2_ENDPOINT', endpoint.trim().replace(/\/$/, ''));
		remember(ctx, 'R2_ACCESS_KEY_ID', accessKeyId.trim());
		remember(ctx, 'R2_SECRET_ACCESS_KEY', secretAccessKey.trim());
		remember(ctx, 'R2_PUBLIC_URL', publicUrl.trim().replace(/\/$/, ''));
	})();
}

function secretsStep(name: string): Step {
	return {
		name,
		run: async (ctx) => {
			for (const key of ['FUNCTION_SECRET', 'BETTER_AUTH_SECRET']) {
				const known = ctx.mode === 'dev' ? existing(ctx, key) : recall(ctx, key);
				remember(ctx, key, known ?? generateSecret());
			}

			log.step('Generated FUNCTION_SECRET and BETTER_AUTH_SECRET.');
		}
	};
}

/**
 * Pushes the variables Convex functions read at runtime. They live on the
 * deployment, not in the .env file the web app reads.
 */
function pushConvexEnv(ctx: StepContext, keys: string[], prod: boolean): Promise<void> {
	return task(`Setting ${prod ? 'production' : 'development'} Convex variables`, () => {
		for (const key of keys) {
			const value = recall(ctx, key);
			if (!value) continue;

			run(['npx', 'convex', 'env', 'set', key, value, ...(prod ? ['--prod'] : [])], {
				cwd: platformDir(ctx)
			});
		}
	});
}

const CONVEX_KEYS = [
	'FUNCTION_SECRET',
	'BETTER_AUTH_SECRET',
	'SITE_URL',
	...GITHUB_KEYS,
	...R2_KEYS
];

/* -------------------------------------------------------------------- dev */

/**
 * Convex analyses the functions as it pushes, and `env.convex.ts` validates its
 * variables at module load — so the very first push always fails: the deployment
 * has to exist before its variables can be set, and the variables have to be set
 * before anything can be pushed. This half provisions and tolerates that failure;
 * `convex-push` runs again once the variables are in place.
 */
const convexProvision: Step = {
	name: 'convex-provision',
	run: async (ctx) => {
		const dir = platformDir(ctx);
		const localEnv = path.join(dir, '.env.local');

		if (!readEnvFile(localEnv).CONVEX_DEPLOYMENT || ctx.options.fresh) {
			note(
				'Convex will ask you to sign in and pick a project, then report a push error — that one is expected.',
				'Create a Convex deployment'
			);

			tryRun(['npx', 'convex', 'dev', '--once'], { cwd: dir, interactive: true });
		}

		const values = readEnvFile(localEnv);

		if (!values.CONVEX_DEPLOYMENT) {
			throw new Error(`Convex did not provision a deployment. Nothing was written to ${localEnv}.`);
		}

		const url =
			values.CONVEX_URL ?? Object.entries(values).find(([key]) => key.endsWith('CONVEX_URL'))?.[1];

		if (!url) throw new Error(`Convex did not write a client URL to ${localEnv}.`);

		remember(ctx, 'PUBLIC_CONVEX_URL', url);
		// the auth adapter proxies to the .convex.site host, which is a different
		// origin from the .convex.cloud client URL
		remember(ctx, 'PUBLIC_CONVEX_SITE_URL', values.CONVEX_SITE_URL ?? siteUrlFrom(url));
		log.step(`Deployment ${values.CONVEX_DEPLOYMENT.split(' ')[0]} is ready.`);
	}
};

/** The push that is meant to work, now that the deployment has its variables. */
const convexPush: Step = {
	name: 'convex-push',
	run: async (ctx) => {
		await task('Pushing functions and generating types', () =>
			run(['npx', 'convex', 'dev', '--once'], { cwd: platformDir(ctx) })
		);
	}
};

const siteDev: Step = {
	name: 'site',
	run: async (ctx) => {
		remember(ctx, 'SITE_URL', DEV_URL);
	}
};

const githubDev: Step = {
	name: 'github',
	run: (ctx) => githubApp(ctx, DEV_URL, 'development')
};

const r2Dev: Step = {
	name: 'r2',
	run: (ctx) => r2Bucket(ctx, 'development')
};

const writeDevEnv: Step = {
	name: 'env',
	run: async (ctx) => {
		const values: Record<string, string> = {};
		for (const key of ['PUBLIC_CONVEX_URL', 'PUBLIC_CONVEX_SITE_URL', 'SITE_URL', ...CONVEX_KEYS]) {
			const value = recall(ctx, key);
			if (value) values[key] = value;
		}

		writeEnvFile(envFile(ctx), values);
		log.step('Wrote .env.local.');
	}
};

const convexEnvDev: Step = {
	name: 'convex-env',
	run: (ctx) => pushConvexEnv(ctx, CONVEX_KEYS, false)
};

const buildCli: Step = {
	name: 'build-cli',
	run: async (ctx) => {
		const runner = await detectRunner(ctx.options.cwd);

		await task('Building the skilless CLI', () =>
			run(runner.run('build:cli'), { cwd: ctx.options.cwd })
		);
	}
};

const devDone: Step = {
	name: 'done',
	run: async (ctx) => {
		const runner = await detectRunner(ctx.options.cwd);

		note(
			[
				`${runner.agent} dev`,
				'',
				`Then open ${DEV_URL}.`,
				'',
				'Point the CLI at it with SKILLESS_API_URL:'
			].join('\n'),
			'Ready'
		);

		block(`SKILLESS_API_URL=${DEV_URL} node packages/skilless/dist/bin.mjs init`);
	}
};

/* ------------------------------------------------------------------- prod */

const domain: Step = {
	name: 'domain',
	run: async (ctx) => {
		const value = await text({
			message: 'Production URL',
			initialValue: recall(ctx, 'SITE_URL') ?? 'https://skilless.dev',
			validate: (input) => (input?.startsWith('https://') ? undefined : 'Must start with https://.')
		});
		exitIfCancelled(value);

		remember(ctx, 'SITE_URL', value.trim().replace(/\/$/, ''));
	}
};

const githubProd: Step = {
	name: 'github-prod',
	run: (ctx) => githubApp(ctx, recall(ctx, 'SITE_URL') ?? 'https://skilless.dev', 'production')
};

function deployProd(ctx: StepContext, captureUrl: boolean): string | null {
	const out = path.join(os.tmpdir(), `skilless-convex-url-${Date.now()}`);

	const command = [
		'npx',
		'convex',
		'deploy',
		'--cmd-url-env-var-name',
		'PUBLIC_CONVEX_URL',
		'--cmd',
		'node -e "require(\'fs\').writeFileSync(process.env.SKILLESS_URL_OUT, process.env.PUBLIC_CONVEX_URL)"'
	];

	const opts = {
		cwd: platformDir(ctx),
		interactive: true,
		env: { SKILLESS_URL_OUT: out }
	};

	if (captureUrl) run(command, opts);
	else tryRun(command, opts);

	const url = fs.existsSync(out) ? fs.readFileSync(out, 'utf8').trim() : '';
	fs.rmSync(out, { force: true });

	return url || null;
}

const r2Prod: Step = {
	name: 'r2-prod',
	run: (ctx) => r2Bucket(ctx, 'production')
};

/** Deploys, which is why it sits after everything that only needed answers. */
const convexProdProvision: Step = {
	name: 'convex-prod-provision',
	run: async (ctx) => {
		const proceed = await confirm({
			message: 'Deploy the Convex functions to production now?'
		});
		exitIfCancelled(proceed);

		if (!proceed) {
			throw new Error('Production needs a deployment before its variables can be set.');
		}

		note(
			'The first deploy reports a push error — production has no variables yet, and it needs to exist before they can be set.',
			'Expected'
		);

		deployProd(ctx, false);
	}
};

/** The deploy that is meant to work. Its URL is what Vercel needs. */
const convexProdDeploy: Step = {
	name: 'convex-prod-deploy',
	run: async (ctx) => {
		const url = deployProd(ctx, true);
		if (!url) throw new Error('Could not read the production Convex URL.');

		remember(ctx, 'PUBLIC_CONVEX_URL', url);
		remember(ctx, 'PUBLIC_CONVEX_SITE_URL', siteUrlFrom(url));
	}
};

const convexEnvProd: Step = {
	name: 'convex-env-prod',
	run: (ctx) => pushConvexEnv(ctx, CONVEX_KEYS, true)
};

/* ------------------------------------------------------------------ vercel */

const VERCEL = ['npx', 'vercel'];

/** Signs in and links the repo, handing the terminal over for either. */
async function vercelLink(ctx: StepContext): Promise<void> {
	const cwd = ctx.options.cwd;

	if (tryRun([...VERCEL, 'whoami'], { cwd }) === null) {
		run([...VERCEL, 'login'], { cwd, interactive: true });
	}

	if (fs.existsSync(path.join(cwd, '.vercel', 'project.json'))) return;

	note(
		'Pick or create the project. Root directory apps/web, framework SvelteKit.',
		'Link the Vercel project'
	);

	// `vercel link` can pull the development variables down over .env.local
	const env = envFile(ctx);
	const saved = fs.existsSync(env) ? fs.readFileSync(env) : null;
	try {
		run([...VERCEL, 'link'], { cwd, interactive: true });
	} finally {
		if (saved) fs.writeFileSync(env, saved, { mode: 0o600 });
	}
}

/**
 * Overwrites whatever is there, so a second run is safe. Values go over stdin;
 * `printf`, not `echo`, since Vercel keeps a trailing newline as part of it.
 */
function vercelEnvSet(
	ctx: StepContext,
	target: 'production' | 'preview',
	values: Record<string, string | undefined>
): Promise<void> {
	return task(`Setting ${target} Vercel variables`, () => {
		for (const [key, value] of Object.entries(values)) {
			if (!value) throw new Error(`${key} has no value to send to Vercel.`);

			// Vercel refuses secret visibility on anything with the PUBLIC_ prefix
			const visibility = key.startsWith('PUBLIC_')
				? ['--no-sensitive', '--visibility', 'config']
				: ['--sensitive'];

			run([...VERCEL, 'env', 'add', key, target, '--force', ...visibility], {
				cwd: ctx.options.cwd,
				input: value
			});
		}
	});
}

const prodDeployKey: Step = {
	name: 'prod-deploy-key',
	run: async (ctx) => {
		note(
			'https://dashboard.convex.dev\n\nYour project → Production → Settings → Deploy keys → Generate a production deploy key.\nVercel needs it to run `convex deploy` during the build.',
			'Convex production deploy key'
		);

		const key = await password({
			message: 'CONVEX_DEPLOY_KEY',
			validate: (value) => (value?.trim() ? undefined : 'Required.')
		});
		exitIfCancelled(key);

		remember(ctx, 'CONVEX_DEPLOY_KEY', key.trim());
	}
};

const vercelProd: Step = {
	name: 'vercel',
	run: async (ctx) => {
		await vercelLink(ctx);

		await vercelEnvSet(ctx, 'production', {
			CONVEX_DEPLOY_KEY: recall(ctx, 'CONVEX_DEPLOY_KEY'),
			FUNCTION_SECRET: recall(ctx, 'FUNCTION_SECRET'),
			// the build gets PUBLIC_CONVEX_URL from `convex deploy`; the server
			// reads both again at runtime, where nothing injects them
			PUBLIC_CONVEX_URL: recall(ctx, 'PUBLIC_CONVEX_URL'),
			PUBLIC_CONVEX_SITE_URL: recall(ctx, 'PUBLIC_CONVEX_SITE_URL')
		});

		note('Set the build command in the project settings to:', 'Convex deploys from Vercel');

		block('pnpm -w vercel:deploy');
	}
};

const prodDone: Step = {
	name: 'done',
	run: async (ctx) => {
		note(
			`${recall(ctx, 'SITE_URL')}\n\nSign in, then mint a token under Tokens for your cloud agents.`,
			'Ready'
		);
	}
};

/* ---------------------------------------------------------------- preview */

const previewKey: Step = {
	name: 'preview-key',
	run: async (ctx) => {
		note(
			'https://dashboard.convex.dev\n\nYour project → Settings → Deploy keys → Generate a preview deploy key.',
			'Convex preview deploy key'
		);

		const key = await password({
			message: 'CONVEX_DEPLOY_KEY',
			validate: (value) => (value?.trim() ? undefined : 'Required.')
		});
		exitIfCancelled(key);

		remember(ctx, 'CONVEX_DEPLOY_KEY', key.trim());
	}
};

const previewVercel: Step = {
	name: 'preview-vercel',
	run: async (ctx) => {
		remember(ctx, 'FUNCTION_SECRET', recall(ctx, 'FUNCTION_SECRET') ?? generateSecret());

		await vercelLink(ctx);

		await vercelEnvSet(ctx, 'preview', {
			CONVEX_DEPLOY_KEY: recall(ctx, 'CONVEX_DEPLOY_KEY'),
			FUNCTION_SECRET: recall(ctx, 'FUNCTION_SECRET')
		});

		note(
			'Each preview gets its own Convex deployment, so its variables are set by the deploy key rather than copied here. PUBLIC_CONVEX_URL is filled in by the build.',
			'Why there is no PUBLIC_CONVEX_URL'
		);

		note(
			[
				'https://dashboard.convex.dev',
				'',
				'Your project → Settings → Environment Variables → Default for preview deployments.',
				'Add R2_BUCKET, R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and',
				'R2_PUBLIC_URL — a bucket of its own, not production’s. Without them previews',
				'can show skills but not open or save their files.'
			].join('\n'),
			'Preview R2 bucket'
		);

		note(
			'GitHub App callbacks cannot be wildcarded, so sign in does not work on a preview URL until you add that exact URL as a callback URL on the GitHub App (it takes up to 10).',
			'Sign in on previews'
		);
	}
};

const previewDone: Step = {
	name: 'done',
	run: async () => {
		note('Push a branch and open the Vercel preview.', 'Ready');
	}
};

/* ------------------------------------------------------------------ order */

export const devSteps: Step[] = [
	dependencies,
	siteDev,
	secretsStep('secrets'),
	githubDev,
	r2Dev,
	convexProvision,
	convexEnvDev,
	convexPush,
	writeDevEnv,
	buildCli,
	devDone
];

export const prodSteps: Step[] = [
	dependencies,
	domain,
	githubProd,
	r2Prod,
	secretsStep('secrets-prod'),
	prodDeployKey,
	convexProdProvision,
	convexEnvProd,
	convexProdDeploy,
	vercelProd,
	prodDone
];

export const previewSteps: Step[] = [dependencies, previewKey, previewVercel, previewDone];
