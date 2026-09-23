import { z } from 'zod';
import { NotAuthenticatedError, OfflineError, SkillessError } from '@/utils/errors';
import type { RemoteSkill, RemoteSkillWithFiles, SkillFile, SkillSource } from '@/utils/types';

const fileSchema = z.object({ path: z.string(), contents: z.string() });

const sourceSchema = z.object({
	url: z.string(),
	ref: z.string().optional(),
	path: z.string(),
	hash: z.string()
});

const skillSchema = z.object({
	name: z.string(),
	contentHash: z.string(),
	editedAt: z.number(),
	updatedAt: z.number(),
	global: z.boolean(),
	// absent from servers that predate sources
	source: sourceSchema.nullable().default(null)
});

const skillWithFilesSchema = skillSchema.extend({ files: z.array(fileSchema) });

const bindingsSchema = z.object({
	bound: z.array(z.string()),
	unknown: z.array(z.string())
});

const errorSchema = z.object({
	error: z.string(),
	message: z.string().optional()
});

/** How many times a request is sent before the server counts as unreachable. */
const ATTEMPTS = 2;
const RETRY_DELAY_MS = 500;
const TIMEOUT_MS = 10_000;

const UNREACHABLE_STATUSES = new Set([502, 503, 504]);

function parseJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

/**
 * Talks to the skilless.dev API. The CLI never reaches Convex directly — the API
 * is the contract, and it is the same one documented at /api/v1/openapi.json.
 */
export class ApiClient {
	readonly #token: string;
	readonly #baseUrl: string;
	#offline = false;

	constructor(token: string, baseUrl: string) {
		this.#token = token;
		this.#baseUrl = baseUrl;
	}

	get baseUrl(): string {
		return this.#baseUrl;
	}

	/**
	 * Sends a request, trying twice before calling the server unreachable. Once
	 * it is, every later request fails straight away — one command should not
	 * wait out the timeout over and over.
	 */
	async #send(
		method: string,
		endpoint: string,
		body?: unknown
	): Promise<{ status: number; text: string }> {
		if (this.#offline) throw new OfflineError(this.#baseUrl);

		let lastCause: unknown;

		for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
			if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));

			try {
				const response = await fetch(`${this.#baseUrl}/api/v1${endpoint}`, {
					method,
					headers: {
						Authorization: `Bearer ${this.#token}`,
						...(body === undefined ? {} : { 'Content-Type': 'application/json' })
					},
					body: body === undefined ? undefined : JSON.stringify(body),
					signal: AbortSignal.timeout(TIMEOUT_MS)
				});

				// the body is read inside the timeout too, or a stalled connection hangs here
				const text = await response.text();

				// a proxy in front of a server that is down — no different from no server
				if (UNREACHABLE_STATUSES.has(response.status)) {
					lastCause = new Error(`${method} ${endpoint} returned ${response.status}.`);
					continue;
				}

				return { status: response.status, text };
			} catch (cause) {
				lastCause = cause;
			}
		}

		this.#offline = true;
		throw new OfflineError(this.#baseUrl, lastCause);
	}

	async #request<T>(
		method: string,
		endpoint: string,
		schema: z.ZodType<T>,
		body?: unknown
	): Promise<T> {
		const response = await this.#send(method, endpoint, body);

		if (response.status === 401) throw new NotAuthenticatedError();

		if (response.status < 200 || response.status >= 300) {
			const parsed = errorSchema.safeParse(parseJson(response.text));

			throw new SkillessError(
				parsed.success
					? (parsed.data.message ?? parsed.data.error)
					: `${method} ${endpoint} failed with ${response.status}.`
			);
		}

		if (response.status === 204) return schema.parse(undefined);

		const parsed = schema.safeParse(parseJson(response.text));

		if (!parsed.success) {
			throw new SkillessError(`Unexpected response from ${method} ${endpoint}.`, {
				suggestion: 'This is likely a version mismatch. Try updating skilless.'
			});
		}

		return parsed.data;
	}

	async listSkills(): Promise<RemoteSkill[]> {
		return await this.#request('GET', '/skills', z.array(skillSchema));
	}

	async getSkill(name: string): Promise<RemoteSkillWithFiles | null> {
		return await this.#request(
			'GET',
			`/skills/${encodeURIComponent(name)}`,
			skillWithFilesSchema.nullable()
		);
	}

	async putSkill(name: string, files: SkillFile[], editedAt: number): Promise<RemoteSkill> {
		return await this.#request('PUT', `/skills/${encodeURIComponent(name)}`, skillSchema, {
			files,
			editedAt
		});
	}

	async setGlobal(name: string, global: boolean): Promise<void> {
		await this.#request('PUT', `/skills/${encodeURIComponent(name)}/global`, z.unknown(), {
			global
		});
	}

	async setSource(name: string, source: SkillSource | null): Promise<void> {
		await this.#request('PUT', `/skills/${encodeURIComponent(name)}/source`, z.unknown(), {
			source
		});
	}

	async deleteSkill(name: string): Promise<void> {
		await this.#request('DELETE', `/skills/${encodeURIComponent(name)}`, z.unknown());
	}

	async getBindings(key: string): Promise<RemoteSkillWithFiles[]> {
		// the key is a whole git remote, so it rides as a query parameter — an
		// encoded `%2F` in a path segment does not survive every proxy
		return await this.#request(
			'GET',
			`/projects/skills?key=${encodeURIComponent(key)}`,
			z.array(skillWithFilesSchema)
		);
	}

	async setBindings(key: string, names: string[]): Promise<z.infer<typeof bindingsSchema>> {
		return await this.#request('PUT', '/projects/skills', bindingsSchema, { key, names });
	}
}
