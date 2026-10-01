---
title: Adding skills
description: Add skills to a project from your library, a git repository or a pack, keep them up to date and take them out again.
---

## From your library

Add skills you already have by name:

```bash
skilless add code-review frontend-design
```

Run `skilless add` with no names to pick from your library. Skills that are [global](/docs/global-skills) show as installed and can't be picked, since every project already has them.

## From a git repository

Pass a repository first, as `owner/repo` or any git URL, then the skills to take from it:

```bash
skilless add vercel-labs/agent-skills web-design-guidelines
```

Leave out the skill names to pick from everything in the repository. The skills are copied into your library, remembering where they came from, and added to this project. If your library already has a skill with the same name, skilless keeps yours unless you pass `--overwrite`.

## From a skill or pack on skilless

A skill or a [pack](/docs/packs) on skilless is added by its owner's username:

```bash
skilless add @ieedan/grill-me
skilless add @ieedan/pack/svelte-essentials
```

Its full link works too: `skilless.dev/skills/ieedan/grill-me`, or `skilless.dev/packs/ieedan/svelte-essentials`.

A pack adds every skill it lists, and `skilless update` brings in any it gains later.

## Keeping them up to date

`skilless update` brings skills you added from a repository up to date with what the repository has now:

```bash
skilless update                  # every skill added from a repository
skilless update frontend-design  # just this one
```

If you've edited a skill since adding it, `update` leaves it alone. Pass `--force` to replace it anyway. Your edited copy is kept first, so nothing is lost.

## Removing and deleting

These are different on purpose:

- `skilless remove <skills...>` takes skills out of **this project**. They stay in your library and in every other project.
- `skilless delete <skills...>` deletes skills from **your library**, which removes them from every project on every machine. skilless asks first. If you're signed in, you can restore a deleted skill from [skilless.dev](/my-skills) for 30 days.

## Importing a folder of skills

If you have a folder of skills, where each subfolder holds a `SKILL.md`, bring them all into your library at once:

```bash
skilless import ~/old-skills
```

Importing only fills your library. Add the skills to projects afterwards with `skilless add`.
