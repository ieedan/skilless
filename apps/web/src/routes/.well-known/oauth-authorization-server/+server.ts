import type { RequestHandler } from '@sveltejs/kit';
import { authorizationServerMetadata, preflight, withCors } from '$lib/server/oauth';

export const GET: RequestHandler = ({ url }) =>
	withCors(Response.json(authorizationServerMetadata(url.origin)));

export const OPTIONS: RequestHandler = () => preflight();
