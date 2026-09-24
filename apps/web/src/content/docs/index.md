---
title: Introduction
description: skilless is a command line tool that keeps one copy of every agent skill and links it into only the projects that need it.
---

Agent skills are folders of instructions, like a `SKILL.md`, that coding agents such as Claude Code read from the project they're working in. That leaves you two options, and neither is great:

- **Copy skills into every project.** Each copy drifts from the others, they show up in your git history, and you end up committing a `skills` folder to repos that aren't yours.
- **Install skills at the user level.** Every project on your machine gets every skill, including the ones that make no sense there.

skilless keeps every skill in a single library on your machine and links each one into the projects you choose. Edit a skill once and every project that uses it sees the change. Nothing is committed: skilless tells git to ignore the links, so your repos look exactly as they did before.

```bash
npx skilless init
```

## What you get

- **One source of truth.** Your skills live in `~/.skilless/skills`. Projects link to them, so there's nothing to keep in sync by hand.
- **Skills per project.** Each project gets only the skills you add to it.
- **Invisible to git.** Links are listed in `.git/info/exclude`, which is never committed, so teammates and pull requests never see them.
- **Works offline.** The library is local first. Signing in is optional.
- **Cloud when you want it.** Sign in to [sync your library](/docs/cloud/sync) across machines and [install skills in cloud agents](/docs/cloud/cloud-agents).

## Next steps

Start with the [quick start](/docs/quick-start), then read [how it works](/docs/how-it-works) to see exactly what skilless writes to disk.
