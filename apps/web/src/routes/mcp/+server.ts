import type { RequestHandler } from '@sveltejs/kit';
import { handleMcp } from '$lib/server/mcp';
import { preflight } from '$lib/server/oauth';

/** Streamable HTTP wants the raw request: POST for messages, GET and DELETE answered by the transport. */
const handler: RequestHandler = ({ request }) => handleMcp(request);

export const GET = handler;
export const POST = handler;
export const DELETE = handler;
export const OPTIONS: RequestHandler = () => preflight();
