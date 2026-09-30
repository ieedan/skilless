import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

const _env = createEnv({
	client: {
		PUBLIC_CONVEX_URL: z.url()
	},
	emptyStringAsUndefined: true,
	clientPrefix: 'PUBLIC_',
	runtimeEnv: import.meta.env
});

export const env = {
	..._env,
	// the auth adapter proxies to this host; a different origin from the client URL
	PUBLIC_CONVEX_SITE_URL: _env.PUBLIC_CONVEX_URL.replace('.convex.cloud', '.convex.site')
};
