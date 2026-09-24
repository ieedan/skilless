---
title: Global skills
description: Make a skill available in every project on your machine, and in your cloud agents, without adding it to each one.
---

Some skills belong everywhere, like how you like commit messages written. Instead of adding those to every project, make them global:

```bash
skilless add --global commit-messages
```

A global skill is linked once into your user-level skill folders, `~/.agents/skills` and `~/.claude/skills`, so every project on your machine has it. You can also create a skill as global from the start:

```bash
skilless create commit-messages --global
```

Global skills follow you into cloud agents too: `skilless install` puts them at the user level there as well.

## Going back

To make a skill project-only again:

```bash
skilless add --not-global commit-messages
```

This unlinks it from your user-level folders. The skill stays in your library, ready to add to the projects that need it.
