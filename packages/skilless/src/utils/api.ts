import { z } from 'zod';
import { NotAuthenticatedError, SkillessError } from '@/utils/errors';
import type { RemoteSkill, RemoteSkillWithFiles, SkillFile } from '@/utils/types';

const fileSchema = z.object({ path: z.string(), contents: z.string() });

const skillSchema = z.object({
	name: z.string(),
	contentHash: z.string(),
	editedAt: z.number(),
	updatedAt: z.number(),
	global: z.boolean()
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

/**
 * Talks to the skilless.dev API. The CLI never reaches Convex directly — the API
 * is the contract, and it is the same one documented at /api/v1/openapi.json.
 */
export class ApiClient {
	readonly #token: string;
	readonly #baseUrl: string;

	constructor(token: string, baseUrl: string) {
		this.#token = token;
		this.#baseUrl = baseUrl;
	}

	async #request<T>(
		method: string,
		endpoint: string,
		schema: z.ZodType<T>,
		body?: unknown
	): Promise<T> {
		let response: Response;

		try {
			response = await fetch(`${this.#baseUrl}/api/v1${endpoint}`, {
				method,
				headers: {
					Authorization: `Bearer ${this.#token}`,
					...(body === undefined ? {} : { 'Content-Type': 'application/json' })
				},
				body: body === undefined ? undefined : JSON.stringify(body)
			});
		} catch (cause) {
			throw new SkillessError(`Could not reach ${this.#baseUrl}.`, {
				suggestion: 'Check your connection, or set SKILLESS_API_URL to point elsewhere.',
				cause
			});
		}

		if (response.status === 401) throw new NotAuthenticatedError();

		if (!response.ok) {
			const parsed = errorSchema.safeParse(await response.json().catch(() => null));

			throw new SkillessError(
				parsed.success
					? (parsed.data.message ?? parsed.data.error)
					: `${method} ${endpoint} failed with ${response.status}.`
			);
		}

		if (response.status === 204) return schema.parse(undefined);

		const json = await response.json();
		const parsed = schema.safeParse(json);

		if (!parsed.success) {
			throw new SkillessError(`Unexpected response from ${method} ${endpoint}.`, {
				suggestion: 'This is likely a version mismatch — try updating skilless.'
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
