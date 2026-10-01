import { createClient, type GenericCtx } from '@convex-dev/better-auth';
import { convex } from '@convex-dev/better-auth/plugins';
import { betterAuth } from 'better-auth/minimal';
import { env } from '../env.convex';
import authConfig from './auth.config';
import { components, internal } from './_generated/api';
import type { DataModel } from './_generated/dataModel';
import { query } from './_generated/server';

export const authComponent = createClient<DataModel>(components.betterAuth);

export const createAuth = (ctx: GenericCtx<DataModel>) => {
	return betterAuth({
		baseURL: env.SITE_URL,
		database: authComponent.adapter(ctx),
		// A GitHub App, not an OAuth app: scopes are ignored in favour of the
		// app's permissions (Email addresses, Contents, Metadata — all read-only),
		// and user tokens expire after 8 hours with a refresh token, which
		// `getAccessToken` exchanges for us. Repo access is limited to where the
		// user has installed the app.
		socialProviders: {
			github: {
				clientId: env.GITHUB_CLIENT_ID,
				clientSecret: env.GITHUB_CLIENT_SECRET
			}
		},
		// these tokens can read private repos, so don't store them in the clear
		account: { encryptOAuthTokens: true },
		databaseHooks: {
			session: {
				create: {
					// every sign-in looks the GitHub login up again, so a rename there follows here
					after: async (session) => {
						if ('scheduler' in ctx) {
							await ctx.scheduler.runAfter(0, internal.profiles.refresh, {
								userId: session.userId
							});
						}
					}
				}
			}
		},
		plugins: [convex({ authConfig })]
	});
};

export const getCurrentUser = query({
	args: {},
	handler: async (ctx) => {
		return authComponent.getAuthUser(ctx);
	}
});
