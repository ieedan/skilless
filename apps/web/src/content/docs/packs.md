---
title: Packs
description: Share a set of skills from anywhere as one address, and add them all with one command.
---

A pack is a list of skills from other places: GitHub repositories, or skills on skilless. Add one and every skill in it lands in your library and this project:

```bash
skilless add skilless.dev/packs/<id>
```

Each skill remembers the pack it came from. `skilless list` and the dashboard show the pack as its origin.

## Making a pack

Open **Packs** on [skilless.dev](/my-packs) and create one. Add your own skills, skills from a GitHub repository, or another pack. A new pack is private: only you can see it, or add it from the CLI while signed in. Turn on **Public** to let anyone with the address use it.

A skill of yours in a public pack still has to be public itself for anyone else to get it. Make it public from the skill's menu.

From the terminal, `skilless packs create` makes one with your skills, or any repository, in it:

```bash
skilless packs create "Svelte essentials" no-effect github.com/sveltejs/ai-tools --public
```

`skilless packs list` and `skilless packs delete` do the rest, and agents connected over [MCP](/docs/cloud/mcp) can manage packs too.

## Writing one by hand

A pack is just JSON, so you can host it anywhere: in a repository, or on your own site. `skilless add` takes any URL that serves one, or a file path:

```bash
skilless add example.com/skills.json
skilless add ./team-pack.json
```

```json
{
	"$schema": "https://skilless.dev/schema/pack.json",
	"name": "Svelte essentials",
	"description": "What I add to every SvelteKit project.",
	"skills": [
		"github.com/anthropics/skills",
		"github.com/sveltejs/ai-tools/skills#main",
		"github.com/ieedan/skills/.agents/skills/test",
		"https://skilless.dev/skills/<id>"
	]
}
```

Only `skills` is required. Each entry is one of:

- **A repository**, `github.com/owner/repo`: every skill in it.
- **A folder in one**, `github.com/owner/repo/path`: every skill in that folder, or the one skill if that is where it lives.
- **A skill on skilless**, `https://skilless.dev/skills/<id>`. Copy a skill's link from its menu on the dashboard.

- **Another pack**, `https://skilless.dev/packs/<id>`, any URL serving one, or a pack file beside this one (`./base.json`): every skill in it, including ones it gains later.

Add `#branch` or `#tag` to a repository to pin it.

A pack can't include itself, directly or through other packs. skilless.dev refuses an entry that would make a loop, and `skilless add` stops with the loop spelled out, like `A includes itself: A → B → A`, for packs hosted anywhere else.

## Following a pack

Adding a pack follows it. `skilless update` checks every pack you follow:

- Skills the pack has gained are copied into your library. They are added to this project if it already uses the pack, or made global if the pack's skills are.
- Skills the pack has dropped are left where they are, and you're asked whether to delete them. Keep one and it stops following the pack.
- Every skill is brought up to date with where it comes from, like any skill added from a repository.

If a skill is in your library from somewhere else already, a pack never replaces it during `update`. Adding the pack again with `skilless add` asks first.

When two packs have the same skill, the one that added it last is its origin.
