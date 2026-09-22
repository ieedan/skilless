import type { SecretClient } from '@skilless/platform/client';
import type { ConvexHttpClient } from 'convex/browser';

declare global {
	namespace App {
		interface Locals {
			token: string | undefined;
			convex: ConvexHttpClient;
			convexSecret: SecretClient;
		}
	}
}

export {};
