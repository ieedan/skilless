---
title: Quick start
description: Install skilless, create your library and add your first skill to a project.
---

## Requirements

- Node.js 22 or later.
- Projects need to be git repositories with a remote. skilless identifies a project by its remote URL, so the same repo is recognized on every machine and in every cloud agent.

## Install

Run skilless with `npx`, or install it globally so `skilless` is on your path:

```bash
npm install -g skilless
```

## Create your library

```bash
skilless init
```

This creates your library at `~/.skilless`. Every skill you create, import or add from a repository is kept there.

## Add a skill to a project

From inside a project, create a new skill:

```bash
skilless create code-review
```

skilless creates `code-review` in your library, adds it to this project, and prints the path to its `SKILL.md` so you can write it. Pick an editor to open new skills in with `skilless config editor`.

Or add a skill someone has published in a git repository. Pass the repo, then the skills to take from it:

```bash
skilless add anthropics/skills frontend-design
```

Leave out the skill names to pick from a list. See [adding skills](/docs/adding-skills) for everything `add` can do.

## Check what's linked

```bash
skilless list --project
```

Your agent now sees the skill in `.claude/skills` and `.agents/skills`, and `git status` is still clean.

## Already have skills?

If you've been copying skills into projects or keeping them at the user level, `skilless migrate` moves them into your library and links them back. See [moving existing skills in](/docs/migrating).
