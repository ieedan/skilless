---
title: Committing a skill
description: Turn a linked skill into real files that belong to the repository.
---

Sometimes a skill should be part of the repo, so everyone who clones it gets the skill. `skilless vendor` copies skills into the project as real files and hands them over to git:

```bash
skilless vendor code-review
```

skilless writes the skill to `.agents/skills/code-review`, removes its line from `.git/info/exclude` so git sees it, and stops managing it in this project. Commit the files like any other change.

The skill stays in your library, and in every other project it was added to. Only this repo gets its own copy, which from now on changes independently.

Run `skilless vendor` with no names to pick from this project's skills.
