---
name: make-me-skilless
description: Setup the users machine to be skilless.
disable-model-invocation: true
---

Setup skilless for the user so that they can use it to clean up their machine and install skills.

```sh
npx skilless init # sets up the files skilless needs
```

If there are skills in the project currently you should ask the user if they want to migrate them or if they want to keep them (if they haven't already specified).

If they want to migrate them you can run, this will migrate all of the skills in the project to be managed by skilless:
```sh
npx skilless migrate --yes
npx skilless migrate --yes --user # migrate user level skills too
```

## Adding skills

You can add skills from the skilless shared library anytime by just running:
```sh
npx skilless add
```

You can also add skills from a remote repository by running:
```sh
npx skilless add <owner>/<repo> # github shorthand
npx skilless add <git-url> # or a git url
```

## Syncing with the cloud

If the user desires skilless can also sync their skills with the cloud using skilless.dev.

To set this up the user needs to authenticate the CLI with `skilless auth` and then you can run:
```sh
npx skilless sync # sync both ways
npx skilless delete # remove a skill (also removes on remote)
npx skilless create # create a skill (automatically synced with remote)
```
