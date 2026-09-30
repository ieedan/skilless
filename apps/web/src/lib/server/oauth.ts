import crypto from 'node:crypto';
import { env } from '$lib/env.server';

/*
 * OAuth 2.1 for MCP clients, per the MCP authorization spec: authorization
 * code with PKCE (S256 only), public clients only, and access tokens that are
 * ordinary skilless tokens, revocable from settings. No refresh tokens — the
 * tokens do not expire.
 *
 * Clients identify themselves one of two ways:
 *
 * - Dynamic registration (RFC 7591). Nothing is stored: the client id is the
 *   client's metadata, signed, so any id we issued can be read back and none
 *   can be forged.
 * - A client ID metadata document: the client id is an https URL serving the
 *   client's metadata, fetched when it is used.
 */

export type Client = {
	clientId: string;
	name: string;
	redirectUris: string[];
};

const CLIENT_PREFIX = 'mcp_';
const MAX_REDIRECT_URIS = 10;
const MAX_URI_LENGTH = 2000;
const MAX_NAME_LENGTH = 100;
const MAX_METADATA_BYTES = 64 * 1024;

/** Schemes a redirect can never be allowed to use, since they run in the page. */
const BLOCKED_SCHEMES = new Set(['javascript:', 'data:', 'vbscript:', 'file:', 'blob:', 'about:']);

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/* --------------------------------------------------------------- metadata */

export function resourceUrl(origin: string) {
	return `${origin}/mcp`;
}

export function resourceMetadataUrl(origin: string) {
	return `${origin}/.well-known/oauth-protected-resource/mcp`;
}

/** RFC 9728. Where an MCP client learns which authorization server to use. */
export function protectedResourceMetadata(origin: string) {
	return {
		resource: resourceUrl(origin),
		resource_name: 'skilless',
		authorization_servers: [origin],
		bearer_methods_supported: ['header']
	};
}

/** RFC 8414. */
export function authorizationServerMetadata(origin: string) {
	return {
		issuer: origin,
		authorization_endpoint: `${origin}/oauth/authorize`,
		token_endpoint: `${origin}/oauth/token`,
		registration_endpoint: `${origin}/oauth/register`,
		response_types_supported: ['code'],
		response_modes_supported: ['query'],
		grant_types_supported: ['authorization_code'],
		code_challenge_methods_supported: ['S256'],
		token_endpoint_auth_methods_supported: ['none'],
		client_id_metadata_document_supported: true
	};
}

/* ----------------------------------------------------------------- clients */

function sign(payload: string): string {
	return crypto
		.createHmac('sha256', env.FUNCTION_SECRET)
		.update(`oauth-client\0${payload}`)
		.digest('base64url');
}

export function isAllowedRedirectUri(value: unknown): value is string {
	if (typeof value !== 'string' || value.length > MAX_URI_LENGTH) return false;

	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return false;
	}

	if (url.hash || BLOCKED_SCHEMES.has(url.protocol)) return false;
	// plain http only back to the client's own machine (RFC 8252)
	if (url.protocol === 'http:') return LOOPBACK_HOSTS.has(url.hostname);

	return true;
}

function cleanName(value: unknown, fallback: string): string {
	const name = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
	return (name || fallback).slice(0, MAX_NAME_LENGTH);
}

/**
 * Registers a client, or explains why not in RFC 7591's terms. Only the fields
 * we use are kept; everything else a client sends is ignored.
 */
export function registerClient(
	body: unknown
): { ok: true; client: Client } | { ok: false; error: string; description: string } {
	const metadata = (body ?? {}) as Record<string, unknown>;
	const uris = metadata.redirect_uris;

	if (!Array.isArray(uris) || uris.length === 0 || uris.length > MAX_REDIRECT_URIS) {
		return {
			ok: false,
			error: 'invalid_redirect_uri',
			description: `Send between 1 and ${MAX_REDIRECT_URIS} redirect_uris.`
		};
	}

	if (!uris.every(isAllowedRedirectUri)) {
		return {
			ok: false,
			error: 'invalid_redirect_uri',
			description: 'Redirect URIs must be https, a loopback http address, or an app scheme.'
		};
	}

	const redirectUris = uris as string[];
	const name = cleanName(metadata.client_name, new URL(redirectUris[0]).host || 'MCP client');
	const payload = Buffer.from(JSON.stringify({ n: name, r: redirectUris })).toString('base64url');

	return {
		ok: true,
		client: { clientId: `${CLIENT_PREFIX}${payload}.${sign(payload)}`, name, redirectUris }
	};
}

function readRegisteredClient(clientId: string): Client | null {
	const [payload, signature, ...rest] = clientId.slice(CLIENT_PREFIX.length).split('.');
	if (!payload || !signature || rest.length > 0) return null;

	const expected = Buffer.from(sign(payload));
	const actual = Buffer.from(signature);
	if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;

	try {
		const { n, r } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
		return { clientId, name: n, redirectUris: r };
	} catch {
		return null;
	}
}

/** Never fetch our own network: only public https hosts named by DNS. */
function isFetchableMetadataUrl(url: URL): boolean {
	if (url.protocol !== 'https:' || url.hash || url.username || url.password) return false;
	if (url.pathname === '/' || LOOPBACK_HOSTS.has(url.hostname)) return false;
	if (url.hostname.startsWith('[') || /^[\d.]+$/.test(url.hostname)) return false;
	return !url.hostname.endsWith('.local') && !url.hostname.endsWith('.internal');
}

async function readMetadataDocument(clientId: string): Promise<Client | null> {
	let url: URL;
	try {
		url = new URL(clientId);
	} catch {
		return null;
	}
	if (!isFetchableMetadataUrl(url)) return null;

	try {
		const response = await fetch(url, {
			headers: { Accept: 'application/json' },
			redirect: 'error',
			signal: AbortSignal.timeout(5000)
		});
		if (!response.ok) return null;

		const text = await response.text();
		if (text.length > MAX_METADATA_BYTES) return null;

		const metadata = JSON.parse(text) as Record<string, unknown>;
		const uris = metadata.redirect_uris;

		// the document has to name itself, or any URL could claim to be any client
		if (metadata.client_id !== clientId) return null;
		if (!Array.isArray(uris) || uris.length === 0 || !uris.every(isAllowedRedirectUri)) return null;

		return { clientId, name: cleanName(metadata.client_name, url.host), redirectUris: uris };
	} catch {
		return null;
	}
}

/** The client behind an id we issued or a metadata document URL. Null when it is neither. */
export async function resolveClient(clientId: string | null): Promise<Client | null> {
	if (!clientId) return null;
	if (clientId.startsWith(CLIENT_PREFIX)) return readRegisteredClient(clientId);
	if (clientId.startsWith('https://')) return await readMetadataDocument(clientId);
	return null;
}

/* ------------------------------------------------------------------- pkce */

/** RFC 7636 S256: base64url(sha256(verifier)). */
export function s256(verifier: string): string {
	return crypto.createHash('sha256').update(verifier).digest('base64url');
}

/** 43 to 128 characters from the unreserved set, as RFC 7636 requires of both halves. */
export function isPkceValue(value: string | null): value is string {
	return value !== null && /^[A-Za-z0-9\-._~]{43,128}$/.test(value);
}

/* ------------------------------------------------------------------ http */

/**
 * The metadata, registration and token endpoints are called from other
 * origins, including browser based MCP clients. They take no cookies, so any
 * origin may call them.
 */
export const CORS_HEADERS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
	'Access-Control-Allow-Headers':
		'Authorization, Content-Type, Mcp-Protocol-Version, Mcp-Session-Id, Last-Event-ID',
	'Access-Control-Expose-Headers': 'WWW-Authenticate, Mcp-Session-Id',
	'Access-Control-Max-Age': '86400'
};

export function withCors(response: Response): Response {
	const headers = new Headers(response.headers);
	for (const [key, value] of Object.entries(CORS_HEADERS)) headers.set(key, value);

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers
	});
}

export function preflight(): Response {
	return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/** An RFC 6749 error body. */
export function oauthError(error: string, description: string, status = 400): Response {
	return withCors(
		Response.json(
			{ error, error_description: description },
			{ status, headers: { 'Cache-Control': 'no-store' } }
		)
	);
}
