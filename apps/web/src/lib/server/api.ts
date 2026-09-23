import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { api as convex } from '@skilless/platform';
import { fetchFiles, SecretClient } from '@skilless/platform/client';
import { ConvexHttpClient } from 'convex/browser';
import { env } from '$lib/env.server';
import { containsNul, hashToken, type SkillFile } from './hash';

const MAX_SKILL_BYTES = 1024 * 1024;

type Variables = { userId: string; convex: SecretClient };

const FileSchema = z
	.object({
		path: z.string().min(1),
		contents: z.string()
	})
	.openapi('SkillFile');

const SourceSchema = z
	.object({
		url: z.string().min(1),
		ref: z.string().optional(),
		/** The skill's directory inside the repo. Empty for the repo root. */
		path: z.string(),
		/** The upstream contentHash as of the last add or update. */
		hash: z.string()
	})
	.openapi('SkillSource');

const SkillSchema = z
	.object({
		name: z.string(),
		contentHash: z.string(),
		editedAt: z.number(),
		updatedAt: z.number(),
		/** Global skills are returned for every project, bound or not. */
		global: z.boolean(),
		/** The git repository this skill was copied from, when it was. */
		source: SourceSchema.nullable()
	})
	.openapi('Skill');

const SkillWithFilesSchema = SkillSchema.extend({
	files: z.array(FileSchema)
}).openapi('SkillWithFiles');

const ErrorSchema = z
	.object({
		error: z.string(),
		message: z.string().optional()
	})
	.openapi('Error');

type SkillDoc = {
	name: string;
	contentHash: string;
	editedAt: number;
	updatedAt: number;
	global?: boolean;
	source?: z.infer<typeof SourceSchema>;
};

/** Never hand back `_id` or `userId` — the CLI has no use for them. */
function toSkill(doc: SkillDoc) {
	return {
		name: doc.name,
		contentHash: doc.contentHash,
		editedAt: doc.editedAt,
		updatedAt: doc.updatedAt,
		global: doc.global ?? false,
		source: doc.source ?? null
	};
}

function validateFiles(files: SkillFile[]): string | null {
	let bytes = 0;

	for (const file of files) {
		if (containsNul(file.contents)) return `${file.path} is not text.`;
		bytes += Buffer.byteLength(file.contents, 'utf8');
	}

	if (bytes > MAX_SKILL_BYTES) return 'Skill is larger than 1MB.';
	if (!files.some((file) => file.path === 'SKILL.md')) return 'Skill has no SKILL.md.';

	return null;
}

const app = new OpenAPIHono<{ Variables: Variables }>();

app.use('/api/v1/*', async (c, next) => {
	if (c.req.path === '/api/v1/openapi.json') return next();

	const header = c.req.header('Authorization');

	if (!header?.startsWith('Bearer ')) {
		return c.json({ error: 'unauthorized', message: 'Missing bearer token.' }, 401);
	}

	const client = new SecretClient(new ConvexHttpClient(env.PUBLIC_CONVEX_URL), env.FUNCTION_SECRET);

	try {
		const { userId } = await client.mutation(convex.tokens.verify, {
			hash: hashToken(header.slice('Bearer '.length))
		});

		c.set('userId', userId);
		c.set('convex', client);
	} catch {
		return c.json({ error: 'unauthorized', message: 'That token is not valid.' }, 401);
	}

	await next();
});

app.onError((err, c) => {
	console.error(err);
	return c.json({ error: 'internal_error', message: 'Something went wrong.' }, 500);
});

/* ----------------------------------------------------------------- skills */

app.openapi(
	createRoute({
		method: 'get',
		path: '/api/v1/skills',
		tags: ['skills'],
		summary: 'List every skill in your library.',
		responses: {
			200: {
				content: { 'application/json': { schema: z.array(SkillSchema) } },
				description: 'Your skills, without file contents.'
			}
		}
	}),
	async (c) => {
		const skills = await c.get('convex').query(convex.skills.listFor, {
			userId: c.get('userId')
		});

		return c.json(skills.map(toSkill), 200);
	}
);

app.openapi(
	createRoute({
		method: 'get',
		path: '/api/v1/skills/{name}',
		tags: ['skills'],
		summary: 'Read one skill, with its files.',
		request: { params: z.object({ name: z.string() }) },
		responses: {
			200: {
				content: { 'application/json': { schema: SkillWithFilesSchema.nullable() } },
				description: 'The skill, or null when you have none by that name.'
			}
		}
	}),
	async (c) => {
		const [found] = await c.get('convex').query(convex.links.readFor, {
			userId: c.get('userId'),
			names: [c.req.valid('param').name]
		});

		if (!found) return c.json(null, 200);

		return c.json({ ...toSkill(found.skill), files: await fetchFiles(found.files) }, 200);
	}
);

app.openapi(
	createRoute({
		method: 'put',
		path: '/api/v1/skills/{name}',
		tags: ['skills'],
		summary: 'Create or replace a skill.',
		request: {
			params: z.object({ name: z.string() }),
			body: {
				content: {
					'application/json': {
						schema: z.object({
							files: z.array(FileSchema),
							editedAt: z.number()
						})
					}
				}
			}
		},
		responses: {
			200: {
				content: { 'application/json': { schema: SkillSchema } },
				description: 'The stored skill.'
			},
			400: {
				content: { 'application/json': { schema: ErrorSchema } },
				description: 'The skill was rejected.'
			}
		}
	}),
	async (c) => {
		const { name } = c.req.valid('param');
		const { files, editedAt } = c.req.valid('json');

		const problem = validateFiles(files);
		if (problem) return c.json({ error: 'invalid_skill', message: problem }, 400);

		// the hash is recomputed by Convex, never taken on trust from the client
		const skill = await c.get('convex').action(convex.files.upsertFor, {
			userId: c.get('userId'),
			name,
			files,
			editedAt
		});

		return c.json(toSkill(skill), 200);
	}
);

app.openapi(
	createRoute({
		method: 'delete',
		path: '/api/v1/skills/{name}',
		tags: ['skills'],
		summary: 'Move a skill to the trash and unbind it everywhere.',
		request: { params: z.object({ name: z.string() }) },
		responses: {
			200: {
				content: { 'application/json': { schema: z.object({ ok: z.boolean() }) } },
				description: 'Deleted.'
			}
		}
	}),
	async (c) => {
		await c.get('convex').mutation(convex.skills.removeFor, {
			userId: c.get('userId'),
			name: c.req.valid('param').name
		});

		return c.json({ ok: true }, 200);
	}
);

app.openapi(
	createRoute({
		method: 'put',
		path: '/api/v1/skills/{name}/global',
		tags: ['skills'],
		summary: 'Mark a skill global, or stop.',
		description:
			'A global skill resolves into every project without being bound to one, including in cloud agents.',
		request: {
			params: z.object({ name: z.string() }),
			body: {
				content: { 'application/json': { schema: z.object({ global: z.boolean() }) } }
			}
		},
		responses: {
			200: {
				content: { 'application/json': { schema: z.object({ ok: z.boolean() }) } },
				description: 'Updated.'
			}
		}
	}),
	async (c) => {
		await c.get('convex').mutation(convex.skills.setGlobalFor, {
			userId: c.get('userId'),
			name: c.req.valid('param').name,
			global: c.req.valid('json').global
		});

		return c.json({ ok: true }, 200);
	}
);

app.openapi(
	createRoute({
		method: 'put',
		path: '/api/v1/skills/{name}/source',
		tags: ['skills'],
		summary: 'Record the git repository a skill came from, or forget it.',
		description:
			'Kept apart from the skill content, so pushing an edit never clears it. Read by `skilless update`.',
		request: {
			params: z.object({ name: z.string() }),
			body: {
				content: {
					'application/json': { schema: z.object({ source: SourceSchema.nullable() }) }
				}
			}
		},
		responses: {
			200: {
				content: { 'application/json': { schema: z.object({ ok: z.boolean() }) } },
				description: 'Updated.'
			}
		}
	}),
	async (c) => {
		await c.get('convex').mutation(convex.skills.setSourceFor, {
			userId: c.get('userId'),
			name: c.req.valid('param').name,
			source: c.req.valid('json').source
		});

		return c.json({ ok: true }, 200);
	}
);

/* --------------------------------------------------------------- projects */

/**
 * The project key is a whole git remote, so it travels as a query parameter
 * rather than a path segment — an encoded `%2F` does not survive every proxy.
 */
app.openapi(
	createRoute({
		method: 'get',
		path: '/api/v1/projects/skills',
		tags: ['projects'],
		summary: 'Resolve a project to its skills, with files.',
		request: { query: z.object({ key: z.string().min(1) }) },
		responses: {
			200: {
				content: { 'application/json': { schema: z.array(SkillWithFilesSchema) } },
				description: 'Everything added to that project.'
			}
		}
	}),
	async (c) => {
		const bound = await c.get('convex').query(convex.projects.boundFor, {
			userId: c.get('userId'),
			key: c.req.valid('query').key
		});

		// a skill trashed between the two calls comes back null, and is simply not installed
		const found = await c.get('convex').query(convex.links.readFor, {
			userId: c.get('userId'),
			names: bound.map((skill) => skill.name)
		});

		const skills = await Promise.all(
			found.flatMap((entry) =>
				entry ? [fetchFiles(entry.files).then((files) => ({ ...toSkill(entry.skill), files }))] : []
			)
		);

		return c.json(skills, 200);
	}
);

app.openapi(
	createRoute({
		method: 'put',
		path: '/api/v1/projects/skills',
		tags: ['projects'],
		summary: 'Replace the set of skills added to a project.',
		request: {
			body: {
				content: {
					'application/json': {
						schema: z.object({
							key: z.string().min(1),
							names: z.array(z.string())
						})
					}
				}
			}
		},
		responses: {
			200: {
				content: {
					'application/json': {
						schema: z.object({
							bound: z.array(z.string()),
							unknown: z.array(z.string())
						})
					}
				},
				description: 'What was bound, and any name that matched nothing.'
			}
		}
	}),
	async (c) => {
		const { key, names } = c.req.valid('json');

		const result = await c.get('convex').mutation(convex.projects.setBindingsFor, {
			userId: c.get('userId'),
			key,
			names
		});

		return c.json(result, 200);
	}
);

app.doc('/api/v1/openapi.json', {
	openapi: '3.0.0',
	info: {
		version: '0.0.1',
		title: 'skilless',
		description: 'Author skills once, sync them everywhere, install them per project.'
	}
});

export { app as api };
