---
title: How it works
description: What skilless writes to disk, how it recognizes a project and how it keeps skills out of git.
---

## The library

Every skill lives once, in your library:

```plaintext
~/.skilless/
  skills/
    code-review/
      SKILL.md
    frontend-design/
      SKILL.md
```

Creating, importing, adding from a repository and syncing all write here. Nothing else holds the real files.

## Projects

A project is a git repository, identified by its remote. SSH and HTTPS remotes for the same repo resolve to the same key, so `git@github.com:acme/api.git` and `https://github.com/acme/api` are both `github.com/acme/api`. That's how a cloud agent that clones over HTTPS finds the skills you added over SSH.

Run a command with `--project <key>` to use a different key than the remote.

## Links

When you add a skill to a project, skilless links it in twice:

```plaintext
your-project/
  .agents/skills/
    code-review  →  ~/.skilless/skills/code-review
  .claude/skills/
    code-review  →  ../../.agents/skills/code-review
```

`.agents/skills` is the shared location many agents read. `.claude/skills` is where Claude Code looks, and it links back to `.agents/skills`, so there's still only one copy. On Windows, skilless uses directory junctions, which don't need admin rights or developer mode.

Because every project links to the same folder, editing a skill in one project edits it everywhere.

## Staying out of git

Each link skilless makes is listed in `.git/info/exclude`:

```plaintext
/.agents/skills/code-review
/.claude/skills/code-review
```

That file works like `.gitignore` but lives inside `.git`, so it's never committed. Your `.gitignore` isn't touched, and teammates who clone the repo get exactly what they got before.

skilless only ever touches what it created. If a skill of the same name is already committed to the repo, or something else is in its place, skilless leaves it alone and tells you.

## Copies instead of links

Where there is no library to link to, such as a fresh cloud agent container, skilless writes real files instead. You can ask for this anywhere with `--copy` on `add`, `remove` and `install`.
