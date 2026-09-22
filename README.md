# skilless

Author skills once, sync them everywhere, install them per project.

Agent skills today are either **global** — `~/.claude/skills`, influencing every
project you open — or **vendored** into `<project>/.claude/skills`, duplicated
per repo and committed into code that may not be yours. Neither works for cloud
agents, which see only the repo they are handed.

skilless makes a skill a synced, per-project assignment.

```bash
skilless init                  # create ~/.skilless and sign in
skilless create code-review    # new skill, added here, path printed to edit
skilless add svelte-testing    # add one you already have to this project
skilless add -g grill-me       # make one part of every project
skilless remove svelte-testing # take it out of this project, keep it
skilless sync                  # two way, including deletions
```

And in any cloud agent's setup step:

```bash
SKILLESS_TOKEN=... npx skilless install
```

## How it works

Your skills live once in `~/.skilless/skills`, which is deliberately _not_
linked into `~/.claude/skills` — a skill is visible to an agent only in projects
you added it to.

Adding one writes:

```
<project>/.agents/skills/<name>          symlink -> ~/.skilless/skills/<name>
<project>/.claude/skills/<name>          symlink -> ../../.agents/skills/<name>
```

Per-entry symlinks, so a repo that already tracks its own `.claude/skills` keeps
what it has. Those two links are the only things skilless writes — there is no
manifest and no state file in your project. Every path skilless creates is added to the repo's local git exclude
file, which is never pushed and never appears in `git status` — that is what
makes this safe in someone else's repository. In a cloud environment there is no
store to link against, so `install` writes real files instead.

A project is identified by its normalized git remote, because that is the only
thing a cloud agent in a fresh container can work out for itself.

A skill marked **global** with `-g` skips bindings entirely and resolves into
every project. That happens server side rather than by writing into
`~/.claude/skills`, so cloud agents get your global skills as well — which a
real global directory could never do.

## Repository layout

| Package             | What it is                                                        |
| ------------------- | ----------------------------------------------------------------- |
| `packages/skilless` | The CLI, published to npm as `skilless`                           |
| `packages/platform` | Convex schema, functions and better-auth                          |
| `apps/web`          | SvelteKit site at skilless.dev, and the Hono API the CLI talks to |

The CLI never reaches Convex directly. It talks to `skilless.dev/api/v1`, whose
OpenAPI document is served at `/api/v1/openapi.json`.

## Development

```bash
pnpm install
pnpm setup:dev
```

`setup:dev` walks through everything: it installs dependencies, creates a Convex
deployment and generates its types, generates `FUNCTION_SECRET` and
`BETTER_AUTH_SECRET` for you, takes you through creating a GitHub OAuth app,
writes `.env.local`, pushes the variables Convex functions need onto the
deployment, and builds the CLI.

It saves its progress, so if a step fails you can run the same command again and
pick up where you left off. `--fresh` starts over.

| Command              | What it sets up                                                        |
| -------------------- | ---------------------------------------------------------------------- |
| `pnpm setup:dev`     | Local development against your own Convex deployment                   |
| `pnpm setup:prod`    | A production Convex deployment plus the variables to paste into Vercel |
| `pnpm setup:preview` | Vercel preview deployments, via a Convex preview deploy key            |

Then:

```bash
pnpm dev
```

### Running tasks with bizi

There is a [bizi](https://getbizi.dev) `task.config.json`, so `bizi` gives you
the dev processes in a TUI with per-task logs:

```bash
bizi          # interactive
bizi run dev  # or a single task: bizi run dev:web
```

The `package.json` scripts still work on their own, so bizi is optional.

### Pointing the CLI at your local API

```bash
SKILLESS_API_URL=http://localhost:5173 node packages/skilless/dist/bin.mjs init
```

`SKILLESS_HOME` overrides the store location, which is handy for testing against
a throwaway library.

## Testing

```bash
pnpm -F skilless test
```

The suite covers the parts that are easy to get quietly wrong: remote
normalization, content hashing, the sync decision table, and materialization
against a real temporary git repository — including that `git status` stays empty
and that the exclude file resolves correctly inside a worktree.

## Status

v0. No marketplaces, no versioning, no teams. See [SPEC.md](./SPEC.md).
