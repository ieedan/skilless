import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

export const env = createEnv({
	server: {
		FUNCTION_SECRET: z.string(),
		BETTER_AUTH_SECRET: z.string(),
		SITE_URL: z.string(),
		GITHUB_CLIENT_ID: z.string(),
		GITHUB_CLIENT_SECRET: z.string()
	},
	emptyStringAsUndefined: true,
	runtimeEnv: process.env
});
