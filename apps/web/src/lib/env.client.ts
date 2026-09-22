import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

export const env = createEnv({
	client: {
		PUBLIC_CONVEX_URL: z.url(),
		// the auth adapter proxies to this host; a different origin from the client URL
		PUBLIC_CONVEX_SITE_URL: z.url()
	},
	emptyStringAsUndefined: true,
	clientPrefix: 'PUBLIC_',
	runtimeEnv: import.meta.env
});
