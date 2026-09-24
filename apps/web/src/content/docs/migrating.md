---
title: Moving existing skills in
description: Move skills you've been copying into projects, or keeping at the user level, into your library.
---

`skilless migrate` finds the skills a project already has, moves them into your library and links them back in their place. Your agent sees no difference, but there's now one copy you can use anywhere.

```bash
skilless migrate
```

Name skills to migrate only those. With no names, skilless migrates everything it finds.

## Skills committed to the repo

Skills that are committed to the repository are only moved if you agree, since moving them changes the repo for everyone. Pass `--include-committed` to move them without asking. Their removal from git is staged for you to commit, not committed.

## User-level skills

`migrate` also offers the skills in your user-level folders, like `~/.claude/skills`. They move into your library as [global skills](/docs/global-skills) and are linked back at the user level, so they keep working in every project. Pass `--user` to include them without asking.
