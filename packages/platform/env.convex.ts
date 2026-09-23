import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

export const env = createEnv({
	server: {
		FUNCTION_SECRET: z.string(),
		BETTER_AUTH_SECRET: z.string(),
		SITE_URL: z.string(),
		GITHUB_CLIENT_ID: z.string(),
		GITHUB_CLIENT_SECRET: z.string(),
		/** The app's URL name, for `github.com/apps/<slug>/installations/new`. */
		GITHUB_APP_SLUG: z.string(),
		/** The R2 bucket's public URL, e.g. `https://pub-<hash>.r2.dev`. */
		R2_PUBLIC_URL: z
			.string()
			.transform((url) => url.replace(/\/$/, ''))
			.optional()
	},
	emptyStringAsUndefined: true,
	runtimeEnv: process.env
});
