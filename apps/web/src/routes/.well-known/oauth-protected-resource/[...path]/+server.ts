import type { RequestHandler } from '@sveltejs/kit';
import { preflight, protectedResourceMetadata, withCors } from '$lib/server/oauth';

/**
 * Served at the root and at `/mcp` beneath it, since clients look up the
 * resource's own path first (RFC 9728 §3.1). There is only the one resource.
 */
export const GET: RequestHandler = ({ url }) =>
	withCors(Response.json(protectedResourceMetadata(url.origin)));

export const OPTIONS: RequestHandler = () => preflight();
