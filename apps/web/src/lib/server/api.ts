import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { api as convex } from '@skilless/platform';
import { fetchFiles, type SecretClient } from '@skilless/platform/client';
import { ConvexError } from 'convex/values';
import { authenticate } from './auth';
import { toPack } from './packs';
import { toSkill, validateFiles } from './skills';
import { supportsBinary, updateMessage, withBinary } from './clients';

type Variables = { userId: string; convex: SecretClient };

const FileSchema = z
	.object({
		path: z.string().min(1),
		/** Text as is, or a binary file's bytes as base64 when `encoding` says so. */
		contents: z.string(),
		encoding: z.literal('base64').optional()
	})
	.openapi('SkillFile');

const SourceSchema = z
	.object({
		url: z.string().min(1),
		ref: z.string().optional(),
		/** The skill's directory inside the repo. Empty for the repo root. */
		path: z.string(),
		/** The upstream contentHash as of the last add or update. */
		hash: z.string(),
		/** The pack that last added it, shown as where it came from. */
		pack: z.object({ url: z.string(), name: z.string().optional() }).optional()
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
		source: SourceSchema.nullable(),
		/** What a pack entry names it by, `@user/skill`. Only in the list, and null until your username is known. */
		address: z.string().nullable().optional()
	})
	.openapi('Skill');

const PackSchema = z
	.object({
		/** Its slug: unique among your packs, and the end of its address. */
		id: z.string(),
		name: z.string(),
		description: z.string().nullable(),
		public: z.boolean(),
		/** Its entries, as its JSON lists them. */
		skills: z.array(z.string()),
		/** How many skills it brings; at least this many while `countPartial`. */
		skillCount: z.number(),
		countPartial: z.boolean(),
		/** What `skilless add` takes. Null until your username has been looked up. */
		url: z.string().nullable()
	})
	.openapi('Pack');

const SkillWithFilesSchema = SkillSchema.extend({
	files: z.array(FileSchema)
}).openapi('SkillWithFiles');

const ErrorSchema = z
	.object({
		error: z.string(),
		message: z.string().optional()
	})
	.openapi('Error');

const app = new OpenAPIHono<{ Variables: Variables }>();

app.use('/api/v1/*', async (c, next) => {
	if (c.req.path === '/api/v1/openapi.json') return next();

	const header = c.req.header('Authorization');

	if (!header?.startsWith('Bearer ')) {
		return c.json({ error: 'unauthorized', message: 'Missing bearer token.' }, 401);
	}

	const auth = await authenticate(header);

	if (!auth) {
		return c.json({ error: 'unauthorized', message: 'That token is not valid.' }, 401);
	}

	c.set('userId', auth.userId);
	c.set('convex', auth.convex);

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
		const [skills, username] = await Promise.all([
			c.get('convex').query(convex.skills.listFor, { userId: c.get('userId') }),
			c.get('convex').query(convex.profiles.usernameFor, { userId: c.get('userId') })
		]);

		return c.json(
			skills.map((skill) => ({
				...toSkill(skill),
				address: username ? `@${username}/${skill.name}` : null
			})),
			200
		);
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
			},
			426: {
				content: { 'application/json': { schema: ErrorSchema } },
				description: 'The skill has binary files and the client did not say it can handle them.'
			}
		}
	}),
	async (c) => {
		const [found] = await c.get('convex').query(convex.links.readFor, {
			userId: c.get('userId'),
			names: [c.req.valid('param').name]
		});

		if (!found) return c.json(null, 200);

		const binary = withBinary([{ name: found.skill.name, files: found.files }]);
		if (binary.length > 0 && !supportsBinary(c.req.raw.headers)) {
			return c.json({ error: 'upgrade_required', message: updateMessage(binary) }, 426);
		}

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
		summary: 'Record where a skill came from, or forget it.',
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
			},
			426: {
				content: { 'application/json': { schema: ErrorSchema } },
				description: 'A skill has binary files and the client did not say it can handle them.'
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

		const binary = withBinary(
			found.flatMap((entry) => (entry ? [{ name: entry.skill.name, files: entry.files }] : []))
		);
		if (binary.length > 0 && !supportsBinary(c.req.raw.headers)) {
			return c.json({ error: 'upgrade_required', message: updateMessage(binary) }, 426);
		}

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

/* ------------------------------------------------------------------ packs */

/** The reasons Convex refuses a pack change, as the API's errors. */
function packError(
	error: unknown
): { status: 400 | 404; body: { error: string; message: string } } | null {
	const data =
		error instanceof ConvexError ? (error.data as { code?: string; message?: string }) : null;
	if (data?.code === 'INVALID_PACK') {
		return {
			status: 400,
			body: { error: 'invalid_pack', message: String(data.message).replace(/^Invalid pack: /, '') }
		};
	}
	if (data?.code === 'PACK_NOT_FOUND') {
		return { status: 404, body: { error: 'not_found', message: 'You have no pack with that id.' } };
	}
	return null;
}

app.openapi(
	createRoute({
		method: 'get',
		path: '/api/v1/packs',
		tags: ['packs'],
		summary: 'List your packs.',
		responses: {
			200: {
				content: { 'application/json': { schema: z.array(PackSchema) } },
				description: 'Your packs.'
			}
		}
	}),
	async (c) => {
		const [packs, username] = await Promise.all([
			c.get('convex').query(convex.packs.listFor, { userId: c.get('userId') }),
			c.get('convex').query(convex.profiles.usernameFor, { userId: c.get('userId') })
		]);
		const origin = new URL(c.req.url).origin;
		return c.json(
			packs.map((pack) => toPack(pack, origin, username)),
			200
		);
	}
);

app.openapi(
	createRoute({
		method: 'post',
		path: '/api/v1/packs',
		tags: ['packs'],
		summary: 'Create a pack.',
		description:
			'Entries are what a pack file lists: `github.com/owner/repo[/path][#ref]`, a skilless skill `@user/skill`, or another pack `@user/pack/<slug>`. New packs are private unless `public` is set.',
		request: {
			body: {
				content: {
					'application/json': {
						schema: z.object({
							name: z.string(),
							description: z.string().optional(),
							skills: z.array(z.string()).optional(),
							public: z.boolean().optional()
						})
					}
				}
			}
		},
		responses: {
			200: {
				content: { 'application/json': { schema: PackSchema } },
				description: 'The new pack.'
			},
			400: {
				content: { 'application/json': { schema: ErrorSchema } },
				description: 'The pack was rejected.'
			}
		}
	}),
	async (c) => {
		const body = c.req.valid('json');
		const userId = c.get('userId');
		try {
			const slug = await c.get('convex').mutation(convex.packs.createPackFor, {
				userId,
				name: body.name,
				description: body.description ?? '',
				skills: body.skills,
				public: body.public
			});
			const [packs, username] = await Promise.all([
				c.get('convex').query(convex.packs.listFor, { userId }),
				c.get('convex').query(convex.profiles.usernameFor, { userId })
			]);
			const pack = packs.find((p) => p.slug === slug)!;
			return c.json(toPack(pack, new URL(c.req.url).origin, username), 200);
		} catch (error) {
			const refused = packError(error);
			if (refused?.status === 400) return c.json(refused.body, 400);
			throw error;
		}
	}
);

app.openapi(
	createRoute({
		method: 'delete',
		path: '/api/v1/packs/{id}',
		tags: ['packs'],
		summary: 'Delete one of your packs.',
		description:
			'Skills already added from it stay where they are; they just stop getting updates from it.',
		request: { params: z.object({ id: z.string() }) },
		responses: {
			200: {
				content: { 'application/json': { schema: z.object({ ok: z.boolean() }) } },
				description: 'Deleted.'
			},
			404: {
				content: { 'application/json': { schema: ErrorSchema } },
				description: 'No such pack of yours.'
			}
		}
	}),
	async (c) => {
		try {
			await c.get('convex').mutation(convex.packs.removeFor, {
				userId: c.get('userId'),
				slug: c.req.valid('param').id
			});
			return c.json({ ok: true }, 200);
		} catch (error) {
			const refused = packError(error);
			if (refused?.status === 404) return c.json(refused.body, 404);
			throw error;
		}
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
