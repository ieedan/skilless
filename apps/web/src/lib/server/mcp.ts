import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { api as convex } from '@skilless/platform';
import { fetchFiles } from '@skilless/platform/client';
import { ConvexError } from 'convex/values';
import { z } from 'zod';
import { type Authenticated, authenticate } from './auth';
import { resourceMetadataUrl, withCors } from './oauth';
import { toPack } from './packs';
import { toSkill, validateFiles } from './skills';

/*
 * The MCP server at /mcp. It is the same library the REST API at /api/v1 serves,
 * shaped as tools an agent can call. Authenticated with the same bearer tokens.
 *
 * Stateless: every request builds a fresh server bound to the caller, so there
 * are no sessions to keep and it runs anywhere a SvelteKit endpoint does.
 */

const INSTRUCTIONS = `skilless stores a user's agent skills in one library and adds them to projects.

A skill is a folder of text files with a SKILL.md at its root. SKILL.md starts with YAML frontmatter holding \`name\` and \`description\`.

A project is identified by its normalized git remote, e.g. \`github.com/owner/repo\`. A project gets every skill bound to it plus every global skill.

A pack is a list of skills from anywhere, added together with \`skilless add <pack url>\`. Its entries are \`github.com/owner/repo[/path][#ref]\` (a repo or folder brings every skill in it, including ones added later) a skilless skill \`@user/skill\`, or another pack \`@user/pack/<slug>\`. A library skill's address comes from list_skills.

Prefer write_skill_file for small edits to an existing skill; save_skill replaces the whole file set.`;

const name = z.string().min(1).describe('The skill name, as it is stored in the library.');
const projectKey = z
	.string()
	.min(1)
	.describe('The project key: its normalized git remote, e.g. `github.com/owner/repo`.');
const path = z.string().min(1).describe('A file path relative to the skill root, e.g. `SKILL.md`.');
const packId = z.string().min(1).describe("The pack's id (its slug), from list_packs.");
const entries = z
	.array(z.string().min(1))
	.describe(
		'Pack entries: `github.com/owner/repo[/path][#ref]`, a skilless skill `@user/skill`, or a pack `@user/pack/<slug>`.'
	);

function json(value: unknown): CallToolResult {
	return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

function fail(message: string): CallToolResult {
	return { content: [{ type: 'text', text: message }], isError: true };
}

/** Turns what Convex throws into something an agent can act on, rather than a transport error. */
function describe(error: unknown): string {
	if (error instanceof ConvexError) {
		const data = error.data as { userMessage?: string; message?: string; code?: string } | null;
		return data?.userMessage ?? data?.message ?? data?.code ?? 'Something went wrong.';
	}

	console.error(error);
	return 'Something went wrong.';
}

type Handler<A> = (args: A) => Promise<CallToolResult>;

function guard<A>(handler: Handler<A>): Handler<A> {
	return async (args) => {
		try {
			return await handler(args);
		} catch (error) {
			return fail(describe(error));
		}
	};
}

function createServer({ userId, convex: client }: Authenticated, origin: string): McpServer {
	const server = new McpServer(
		{ name: 'skilless', version: '0.0.1' },
		{ instructions: INSTRUCTIONS }
	);

	/** The user's username, once: every pack address needs it. */
	let username: Promise<string | null> | undefined;
	const usernameOf = () => (username ??= client.query(convex.profiles.usernameFor, { userId }));

	async function readSkill(skillName: string) {
		const [found] = await client.query(convex.links.readFor, { userId, names: [skillName] });
		if (!found) return null;

		// binary files come as where to find them, not as base64 an agent cannot read anyway
		const text = await fetchFiles(found.files.filter((link) => !link.binary));
		const binary = found.files
			.filter((link) => link.binary)
			.map((link) => ({ path: link.path, binary: true as const, size: link.size, url: link.url }));
		const files = [...text, ...binary].sort((a, b) => a.path.localeCompare(b.path));
		return { skill: found.skill, files };
	}

	/* --------------------------------------------------------------- skills */

	server.registerTool(
		'list_skills',
		{
			title: 'List skills',
			description:
				'List every skill in the library with its description. File contents are not included; use get_skill for those.',
			annotations: { readOnlyHint: true }
		},
		guard(async () => {
			const [skills, username] = await Promise.all([
				client.query(convex.skills.listFor, { userId }),
				usernameOf()
			]);

			return json(
				skills.map((skill) => ({
					...toSkill(skill),
					title: skill.title ?? null,
					description: skill.description ?? null,
					/** What a pack entry names it by. */
					address: username ? `@${username}/${skill.name}` : null
				}))
			);
		})
	);

	server.registerTool(
		'get_skill',
		{
			title: 'Read a skill',
			description:
				'Read one skill with the contents of its files. Pass `path` to read a single file instead of all of them. Binary files (images and the like) come as `binary: true` with their size and a URL instead of contents.',
			inputSchema: { name, path: path.optional() },
			annotations: { readOnlyHint: true }
		},
		guard(async (args) => {
			const found = await readSkill(args.name);
			if (!found) return fail(`There is no skill named ${args.name}.`);

			const files = args.path ? found.files.filter((file) => file.path === args.path) : found.files;

			if (args.path && files.length === 0) {
				return fail(
					`${args.name} has no file at ${args.path}. It has: ${found.files.map((file) => file.path).join(', ')}.`
				);
			}

			return json({ ...toSkill(found.skill), files });
		})
	);

	server.registerTool(
		'save_skill',
		{
			title: 'Create or replace a skill',
			description:
				'Create a skill, or replace an existing one with exactly this file set. Text files left out are removed; binary files it already has are kept unless named here (delete them with delete_skill_file). A SKILL.md is required and the whole skill must be under 3MB.',
			inputSchema: {
				name,
				files: z
					.array(
						z.object({
							path,
							contents: z.string(),
							encoding: z
								.literal('base64')
								.optional()
								.describe('Set for a binary file, with its bytes as base64 in `contents`.')
						})
					)
					.min(1)
					.describe('Every text file of the skill, and any binary files to add or replace.')
			},
			annotations: { destructiveHint: true, idempotentHint: true }
		},
		guard(async (args) => {
			const problem = validateFiles(args.files);
			if (problem) return fail(problem);

			const skill = await client.action(convex.files.upsertFor, {
				userId,
				name: args.name,
				files: args.files,
				editedAt: Date.now(),
				keepBinary: true
			});

			return json(toSkill(skill));
		})
	);

	server.registerTool(
		'write_skill_file',
		{
			title: 'Write a skill file',
			description:
				'Create or overwrite one file of an existing skill, leaving its other files as they are.',
			inputSchema: {
				name,
				path,
				contents: z.string().describe('The whole new file contents.'),
				encoding: z
					.literal('base64')
					.optional()
					.describe('Set for a binary file, with its bytes as base64 in `contents`.')
			},
			annotations: { destructiveHint: true, idempotentHint: true }
		},
		guard(async (args) => {
			const skill = await client.action(convex.files.writeFileFor, {
				userId,
				name: args.name,
				path: args.path,
				contents: args.contents,
				encoding: args.encoding
			});

			return json(toSkill(skill));
		})
	);

	server.registerTool(
		'delete_skill_file',
		{
			title: 'Delete a skill file',
			description:
				'Remove one file from a skill, or every file beneath a directory when `path` is a directory.',
			inputSchema: { name, path },
			annotations: { destructiveHint: true }
		},
		guard(async (args) => {
			const removed = await client.action(convex.files.deletePathFor, {
				userId,
				name: args.name,
				path: args.path
			});

			return json({ removed });
		})
	);

	server.registerTool(
		'delete_skill',
		{
			title: 'Delete a skill',
			description:
				'Move a skill to the trash and remove it from every project. It can be restored from skilless.dev.',
			inputSchema: { name },
			annotations: { destructiveHint: true, idempotentHint: true }
		},
		guard(async (args) => {
			await client.mutation(convex.skills.removeFor, { userId, name: args.name });
			return json({ ok: true });
		})
	);

	server.registerTool(
		'set_skill_global',
		{
			title: 'Make a skill global',
			description:
				'Mark a skill global, so it is added to every project without being bound to one, or stop.',
			inputSchema: { name, global: z.boolean() },
			annotations: { idempotentHint: true }
		},
		guard(async (args) => {
			await client.mutation(convex.skills.setGlobalFor, {
				userId,
				name: args.name,
				global: args.global
			});
			return json({ ok: true });
		})
	);

	/* ------------------------------------------------------------- projects */

	server.registerTool(
		'list_projects',
		{
			title: 'List projects',
			description:
				'List every project with the skills bound to it. Global skills apply to every project and are not listed here.',
			annotations: { readOnlyHint: true }
		},
		guard(async () => json(await client.query(convex.projects.listFor, { userId })))
	);

	server.registerTool(
		'get_project_skills',
		{
			title: 'Resolve a project',
			description:
				'List the skills a project gets: everything bound to it plus every global skill. File contents are not included.',
			inputSchema: { key: projectKey },
			annotations: { readOnlyHint: true }
		},
		guard(async (args) => {
			const skills = await client.query(convex.projects.boundFor, { userId, key: args.key });

			return json(
				skills.map((skill) => ({
					...toSkill(skill),
					title: skill.title ?? null,
					description: skill.description ?? null
				}))
			);
		})
	);

	server.registerTool(
		'add_skill_to_project',
		{
			title: 'Add a skill to a project',
			description:
				'Bind a skill to a project, creating the project if it has none yet. It installs the next time `skilless install` runs there.',
			inputSchema: { key: projectKey, name },
			annotations: { idempotentHint: true }
		},
		guard(async (args) => {
			await client.mutation(convex.projects.setBindingFor, {
				userId,
				key: args.key,
				name: args.name,
				bound: true
			});
			return json({ ok: true });
		})
	);

	server.registerTool(
		'remove_skill_from_project',
		{
			title: 'Remove a skill from a project',
			description:
				'Unbind a skill from a project without deleting it. A global skill still applies until it is made not global.',
			inputSchema: { key: projectKey, name },
			annotations: { destructiveHint: true, idempotentHint: true }
		},
		guard(async (args) => {
			await client.mutation(convex.projects.setBindingFor, {
				userId,
				key: args.key,
				name: args.name,
				bound: false
			});
			return json({ ok: true });
		})
	);

	/* ---------------------------------------------------------------- packs */

	const packWithEntries = async (id: string) => {
		const view = await client.query(convex.packs.getFor, { userId, slug: id });
		if (!view) return null;
		return {
			...toPack(view.pack, origin, await usernameOf()),
			entries: view.entries.map(({ entry, skill, repo }) => ({
				entry,
				skill: skill && {
					name: skill.name,
					description: skill.description ?? null,
					public: skill.public
				},
				repo: repo && {
					found: repo.found,
					description: repo.description,
					skills: repo.skills.map((s) => s.name)
				}
			}))
		};
	};

	server.registerTool(
		'list_packs',
		{
			title: 'List packs',
			description: "List the user's packs, with their entries and the URL to add each with.",
			annotations: { readOnlyHint: true }
		},
		guard(async () => {
			const packs = await client.query(convex.packs.listFor, { userId });
			const name = await usernameOf();
			return json(packs.map((pack) => toPack(pack, origin, name)));
		})
	);

	server.registerTool(
		'get_pack',
		{
			title: 'Read a pack',
			description:
				'Read one pack, with what each entry resolves to: the skilless skill it names, or the skills found in its repository.',
			inputSchema: { id: packId },
			annotations: { readOnlyHint: true }
		},
		guard(async (args) => {
			const pack = await packWithEntries(args.id);
			return pack ? json(pack) : fail(`There is no pack of yours with id ${args.id}.`);
		})
	);

	server.registerTool(
		'create_pack',
		{
			title: 'Create a pack',
			description: 'Create a pack. It is private unless `public` is true.',
			inputSchema: {
				name: z.string().min(1).describe('What the pack is called.'),
				description: z.string().optional(),
				skills: entries.optional(),
				public: z.boolean().optional()
			}
		},
		guard(async (args) => {
			const id = await client.mutation(convex.packs.createPackFor, {
				userId,
				name: args.name,
				description: args.description ?? '',
				skills: args.skills,
				public: args.public
			});
			return json(await packWithEntries(id));
		})
	);

	server.registerTool(
		'update_pack',
		{
			title: 'Change a pack',
			description:
				'Add entries to a pack, remove entries from it, or make it public or private. Entries to remove must be written exactly as get_pack lists them.',
			inputSchema: {
				id: packId,
				add: entries.optional(),
				remove: entries.optional(),
				public: z.boolean().optional()
			},
			annotations: { idempotentHint: true }
		},
		guard(async (args) => {
			if (args.add?.length) {
				await client.mutation(convex.packs.addEntriesFor, {
					userId,
					slug: args.id,
					entries: args.add
				});
			}
			if (args.remove?.length) {
				await client.mutation(convex.packs.removeEntriesFor, {
					userId,
					slug: args.id,
					entries: args.remove
				});
			}
			if (args.public !== undefined) {
				await client.mutation(convex.packs.setPublicFor, {
					userId,
					slug: args.id,
					public: args.public
				});
			}
			return json(await packWithEntries(args.id));
		})
	);

	server.registerTool(
		'delete_pack',
		{
			title: 'Delete a pack',
			description:
				'Delete a pack for good. Skills people already added from it stay; they just stop getting updates from it.',
			inputSchema: { id: packId },
			annotations: { destructiveHint: true }
		},
		guard(async (args) => {
			await client.mutation(convex.packs.removeFor, { userId, slug: args.id });
			return json({ deleted: args.id });
		})
	);

	return server;
}

/**
 * Points the client at the OAuth metadata (RFC 9728 §5.1), which is how an MCP
 * client without a token finds out how to get one.
 */
function unauthorized(origin: string, message: string, invalid = false): Response {
	const challenge = [
		'Bearer realm="skilless"',
		`resource_metadata="${resourceMetadataUrl(origin)}"`,
		...(invalid ? ['error="invalid_token"'] : [])
	].join(', ');

	return withCors(
		Response.json(
			{ jsonrpc: '2.0', error: { code: -32001, message }, id: null },
			{ status: 401, headers: { 'WWW-Authenticate': challenge } }
		)
	);
}

/** Handles one MCP request over Streamable HTTP. */
export async function handleMcp(request: Request): Promise<Response> {
	const { origin } = new URL(request.url);

	const header = request.headers.get('Authorization') ?? undefined;
	if (!header?.startsWith('Bearer ')) return unauthorized(origin, 'Missing bearer token.');

	const auth = await authenticate(header);
	if (!auth) return unauthorized(origin, 'That token is not valid.', true);

	const server = createServer(auth, origin);
	const transport = new WebStandardStreamableHTTPServerTransport({
		sessionIdGenerator: undefined,
		enableJsonResponse: true
	});

	await server.connect(transport);
	return withCors(await transport.handleRequest(request));
}
