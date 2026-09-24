---
title: Introduction
description: Use your own agent skills in specific projects, including repositories you do not own, without changing those repositories.
---

You may work in projects you own and repositories maintained by other people. A skill that helps in one project may not apply to another. You still need a way to give each agent the relevant skills without changing every repository you clone.

Copying skills into each project leaves you with duplicate, unversioned Markdown files to maintain. Installing them at the user level avoids those copies, but makes every skill available in every project. Committing the skills solves neither problem when they are part of your workflow rather than the repository.

skilless stores one copy of each skill and links it only into the projects you choose. It excludes those links from Git, so you can use your skills in any local clone without adding a skills folder to its history.

```bash
npx skilless init
```

## One copy of each skill

Each project link points to the copy in `~/.skilless/skills`. When you edit that copy, every project using it reads the update. You do not have to find and update separate Markdown files.

## No changes to the repository

skilless adds its links to `.git/info/exclude`. Unlike `.gitignore`, this file stays in your local clone. The links do not appear as tracked changes or enter the repository's history.

This matters when you do not own the project or when your teammates use different agent setups. You can configure your agent without requiring anyone else to use the same skills.

## Local by default

The library also works without an account or network connection. Sign in only if you want to [sync skills across machines](/docs/cloud/sync) or [install them in cloud agents](/docs/cloud/cloud-agents).

## Next steps

Start with the [quick start](/docs/quick-start). If you want to understand the linking and git behavior before installing anything, read [how it works](/docs/how-it-works).
