import * as fsu from '@/utils/fs';
import { AUTH_FILE } from '@/utils/paths';

export const TOKEN_ENV_VAR = 'SKILLESS_TOKEN';
export const API_URL_ENV_VAR = 'SKILLESS_API_URL';

export const DEFAULT_API_URL = 'https://skilless.dev';

type AuthFile = { token?: string };

/**
 * The environment variable wins, so a cloud agent with `SKILLESS_TOKEN` set
 * never accidentally picks up a stale token baked into an image.
 */
export function getToken(): string | undefined {
	const fromEnv = process.env[TOKEN_ENV_VAR];
	if (fromEnv) return fromEnv;

	return fsu.readJson<AuthFile>(AUTH_FILE, {}).token;
}

export function setToken(token: string): void {
	fsu.writeJson(AUTH_FILE, { token }, 0o600);
}

export function clearToken(): void {
	fsu.remove(AUTH_FILE);
}

export function getApiUrl(): string {
	return (process.env[API_URL_ENV_VAR] ?? DEFAULT_API_URL).replace(/\/$/, '');
}
