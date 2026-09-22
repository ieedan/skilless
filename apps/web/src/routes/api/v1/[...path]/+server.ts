import type { RequestHandler } from '@sveltejs/kit';
import { api } from '$lib/server/api';

/** Hands the untouched request to Hono so it sees the raw URL, headers and body. */
const handler: RequestHandler = ({ request }) => api.fetch(request);

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
