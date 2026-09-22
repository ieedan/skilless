import { createEnv } from '@t3-oss/env-core';
import { vercel } from '@t3-oss/env-core/presets-zod';
import { z } from 'zod';

export const env = createEnv({
	server: {
		PUBLIC_CONVEX_URL: z.url(),
		// the auth adapter proxies to this host; a different origin from the client URL
		PUBLIC_CONVEX_SITE_URL: z.url(),
		FUNCTION_SECRET: z.string()
	},
	emptyStringAsUndefined: true,
	runtimeEnv: process.env,
	extends: [vercel()]
});
