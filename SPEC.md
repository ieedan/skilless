# skilless — v0 spec

> Flexible skill management. Author skills once, sync them to the cloud, install
> them into any project — local or cloud agent — without duplicating files or
> polluting someone else's repo.

## Problem

Agent skills today are either **global** (`~/.claude/skills`, influences every
project) or **vendored** (`<project>/.claude/skills`, duplicated per repo and
committed into code that may not be yours). Neither works for cloud agents,
which see only the repo they're handed.

skilless makes skills a synced, per-project assignment.

## v0 scope

**In:** authoring skills locally, two-way sync with skilless.dev, binding skills
to a project, installing bound skills into local and cloud agents.

**Out (explicit non-goals):** marketplaces, versions/pinning (latest-wins),
teams/orgs, packs/collections, in-repo team manifest, vendor-to-git mode, targets
beyond `.agents` and `.claude`, web-based skill editing (website is read-only).

> **On marketplaces (deferred).** skills.sh was evaluated and cut from v0.
> Findings for whoever picks it up:
>
> - **Installing needs no auth.** The official `skills` CLI (`npx skills add
>   vercel-labs/agent-skills`) has exactly two dependencies, `tar` and `yaml` —
>   it resolves `owner/repo` to a GitHub tarball and extracts it. Skill content
>   is public GitHub. A future `skilless add owner/repo` can work the same way,
>   with zero third-party auth.
> - **Discovery does need auth.** `/api/v1/skills`, `/search`, `/curated`,
>   `/audit` all return `401` unauthenticated and require a **Vercel OIDC token**
>   scoped to a Vercel team *and project* — which a CLI cannot obtain unless the
>   user maintains a linked Vercel project. So search/ranking/audits must be
>   proxied by skilless.dev via `@vercel/oidc`, sharing one 600/min bucket across
>   all users; cache on the upstream `hash`.
> - Therefore split the feature: content from GitHub unauthenticated, catalog
>   metadata through our proxy. Only the catalog half has a scaling ceiling.
> - The official CLI posts anonymous install telemetry (skill name, files,
>   timestamp) to power the leaderboard; `DISABLE_TELEMETRY=1` opts out. Decide
>   deliberately whether skilless reports installs upstream.
>
> The `skills.source` field below is reserved for this.

---

## Concepts

**Skill** — a directory containing `SKILL.md` plus optional resource files.
Owned by one user, unique by name within that user's library.

**Project** — identified by its normalized git remote, e.g.
`github.com/ieedan/layerchart`. This is the key that lets a cloud agent in a
fresh container resolve the right skills.

**Binding** — `project key -> [skill names]`. Lives in the cloud only.

---

## Local layout

```
~/.skilless/
  auth.json              # { token }                   chmod 600
  state.json             # per-skill last-synced hash — drives deletion detection
  conflicts/<name>/<ts>/ # losing copies from last-write-wins resolutions
  skills/<name>/         # working copy — the source of truth you edit
    SKILL.md
```

`~/.skilless/skills` is deliberately **not** symlinked into `~/.claude/skills`.
Skills are visible to an agent only once added to a project.

## Project layout after install

```
<project>/
  .agents/skills/<name>         # symlink -> ~/.skilless/skills/<name>
  .agents/skills/.skilless.json # ownership record: what skilless created
  .claude/skills/<name>         # symlink -> ../../.agents/skills/<name>
```

Per-entry symlinks (not a whole-directory symlink) so a repo that already tracks
`.claude/skills/their-skill` keeps it and ours land alongside.

In cloud environments (no `~/.skilless/skills` present, or `--copy`), real files
are written instead of symlinks.

### Guest repos

Every path skilless creates is appended to the repo's local git exclude file, so
it never appears in `git status` and can't leak into a PR.

- Resolve the exclude file via `git rev-parse --git-common-dir` + `/info/exclude`
  — **not** hardcoded `.git/info/exclude`, which is wrong inside git worktrees.
- git exclude only applies to *untracked* paths: refuse to write over any path
  that is already tracked, and report it.

---

## CLI

Follows jsrepo conventions: `commander`, zod option schemas, one file per command
in `src/commands/`, a token manager in `src/utils/`. Prompts use **enquirer**.

Commands split into two scopes: **project** (what this repo gets) and
**library** (what skills exist at all).

| Command | Scope | Behavior |
|---|---|---|
| `skilless init` | — | Create `~/.skilless`, run browser sign-in, write `auth.json`. Idempotent. |
| `skilless auth [--logout]` | — | Re-auth / sign out. |
| `skilless create <name>` | library | Scaffold `~/.skilless/skills/<name>/SKILL.md`, push it, bind it to the current project, materialize it, and **print the path to edit**. |
| `skilless add <skill...>` | project | Bind existing library skills to this project and materialize them. |
| `skilless remove <skill...>` | library | Delete the skill outright: unbind it from every project, delete the materialized files here, remove it from your library, and sync. Confirmed. |
| `skilless install` | project | Materialize everything bound to this project. The cloud-agent entry point. |
| `skilless sync` | library | Two-way sync `~/.skilless/skills` <-> cloud, including deletions. |
| `skilless import <dir>` | library | Import each subdirectory containing a `SKILL.md` as a skill. |
| `skilless list [--project]` | both | List your library, or this project's bound skills. |

`install` is the only command that must work non-interactively with no local
state: token from `SKILLESS_TOKEN`, project key from the git remote, content
fetched fresh and written as real files.

### Sync algorithm

Each skill has a `contentHash` over sorted `(path, contents)` pairs. `state.json`
records the hash at last successful sync — that third data point is what makes
deletion safe to propagate, because it distinguishes *deleted* from *never seen*.

Let L = local names, R = remote names, S = names in `state.json`.

| condition | meaning | action |
|---|---|---|
| in L, in R, hashes equal | unchanged | no-op |
| in L, in R, local != S, remote == S | edited locally | push |
| in L, in R, local == S, remote != S | edited elsewhere | pull |
| in L, in R, both differ from S | conflict | newer `editedAt` wins; loser stashed |
| in L, not in R, **in S** | deleted remotely | delete locally (confirm) |
| in L, not in R, **not in S** | newly created here | push |
| in R, not in L, **in S** | deleted locally | delete remotely (confirm) |
| in R, not in L, **not in S** | new elsewhere | pull |

A fresh machine has an empty `state.json`, so every remote skill is "new
elsewhere" and nothing is ever deleted. Deletions prompt unless `--yes`.

**Conflict resolution is last-write-wins.** When both sides changed, the version
with the newer `editedAt` is kept. `editedAt` is the max file mtime within the
skill directory, reported by the client on push and stored alongside the server's
own `updatedAt` — comparing two client-reported edit times is symmetric, whereas
comparing a local mtime to a server receive time silently favors remote.

Because the hash comparison runs first, a file whose mtime moved without its
contents changing (`git checkout`, a copy, some editors) never reaches this
branch.

**The losing version is never discarded.** The syncing machine holds both copies,
so before overwriting either side it writes the loser to
`~/.skilless/conflicts/<name>/<ISO timestamp>/` and prints the path. This matters
because clock skew can make a stale edit win: a machine running fast can beat a
genuinely newer edit made elsewhere. `--push` and `--pull` remain as manual
overrides for a whole sync run.

Server-side deletes are **soft** (30-day trash, restorable from the website).
Sync can destroy work; this is the seatbelt.

`skilless remove` is the same operation with a nicer front door: it deletes
`~/.skilless/skills/<name>` and runs the sync path, so one code path handles
both. Deleting the directory by hand and syncing is equivalent.

**Other checkouts.** Removing a skill leaves dangling `.agents/skills/<name>`
symlinks in any other clone where it was materialized, since skilless doesn't
track project paths across machines. `install` and `sync` must prune dangling
entries listed in `.skilless.json` that no longer resolve.

### Environment

| Var | Purpose |
|---|---|
| `SKILLESS_TOKEN` | Bearer token for non-interactive use (cloud agents, CI) |
| `SKILLESS_API_URL` | Override API base (local dev) |

---

## Stack

pnpm monorepo, shaped after `jsrepo`:

```
skilless/
  apps/web/              # SvelteKit -> skilless.dev (from convex-app)
  packages/platform/     # Convex + better-auth (from convex-app)
  packages/skilless/     # the CLI, published to npm as `skilless`
```

- **CLI** — TypeScript, `commander` + `enquirer` + zod, `bin.ts` -> `cli.ts` ->
  `src/commands/*`, matching jsrepo's structure.
- **Backend** — Convex with better-auth, GitHub sign-in only.
- **API** — Hono mounted in SvelteKit at `skilless.dev/api/v1` via a
  `[...path]/+server.ts` catch-all, using `@hono/zod-openapi`. Spec served at
  `/api/v1/openapi.json`; the CLI uses a generated typed client. Convex stays an
  implementation detail behind the API, never hit directly by the CLI.

### Data model (Convex)

```ts
skills:     { userId, name, contentHash, editedAt, source?, deletedAt?, updatedAt }
            // editedAt: client-reported max file mtime — the LWW tiebreak
            // updatedAt: server receive time — display only, never compared
            // source? reserved for future marketplace provenance; unused in v0
            // by_user_and_name
skillFiles: { skillId, path, contents }        // by_skill
projects:   { userId, key }                    // by_user_and_key
bindings:   { projectId, skillId }             // by_project
cliTokens:  { userId, hash, name, lastUsedAt } // by_hash
```

Skill files are stored as text documents (skills are small prose), not blobs —
this makes rendering them on the website trivial. Cap total skill size (~1MB)
and reject binaries in v0.

### Auth

- **Web** — better-auth session, GitHub OAuth.
- **CLI `init`** — loopback: open `skilless.dev/cli/auth?port=<n>`, the page POSTs
  a newly minted CLI token to `http://127.0.0.1:<n>`. Simpler than device flow
  and sufficient because headless environments use `SKILLESS_TOKEN` instead.
- **CLI requests** — `Authorization: Bearer <token>`. Tokens stored hashed
  server-side; shown once at creation.
- **Cloud agents** — token minted on the website, pasted into the environment's
  secrets as `SKILLESS_TOKEN`.

### API surface

```
POST   /v1/auth/cli/exchange          # loopback token exchange
GET    /v1/skills                     # list (name, contentHash, updatedAt)
POST   /v1/skills                     # create
GET    /v1/skills/:name               # full content
PUT    /v1/skills/:name               # replace files (push)
DELETE /v1/skills/:name               # soft delete
GET    /v1/projects/:key/skills       # resolve bindings -> skills + content
PUT    /v1/projects/:key/skills       # set bindings
```

`:key` is URL-encoded, e.g. `github.com%2Fieedan%2Flayerchart`.

### Website (v0)

Sign in with GitHub. List your skills, view a skill's rendered `SKILL.md`, see
which projects it's bound to, unbind it from a project, and restore
soft-deleted skills. Mint and revoke CLI tokens. Read-only for content.

---

## Open questions

1. **Project key normalization.** SSH vs HTTPS remotes, case, trailing `.git`,
   and forks. A fork has a different remote than upstream — does it inherit the
   upstream's bindings? Proposed: never implicitly; aliasing is explicit and
   user-confirmed, or a fork silently inherits someone else's skill set.
2. **No git remote.** Local-only repos have no key. Fall back to an explicit
   `--project <slug>`, or refuse?
3. **Monorepos.** One remote, but subprojects may want different skills. v0
   binds at the repo root only.
4. **`create` outside a repo.** No project key to bind to — create in the library
   and warn, presumably.
5. **Import collisions.** `~/.agents/skills` has 14 skills; two (`grill-me`,
   `animate`) are gitignored and exist only on this machine.
