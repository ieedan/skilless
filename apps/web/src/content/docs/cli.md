---
title: CLI
description: Every skilless command and option.
---

Run `skilless <command> --help` for the same information in your terminal. Every command also takes `--cwd <path>` to run as if from another directory.

## init

Create your library at `~/.skilless`.

```bash
skilless init
```

## create

Create a skill in your library, add it to this project and print the path to its `SKILL.md`.

```bash
skilless create [name]
```

| Option                     | Description                                                                 |
| -------------------------- | --------------------------------------------------------------------------- |
| `-d, --description <text>` | What the skill does, for the frontmatter.                                   |
| `-g, --global`             | Make it [global](/docs/global-skills) instead of adding it to this project. |
| `--no-open`                | Don't open `SKILL.md` in your editor.                                       |
| `--project <key>`          | Use this project key instead of the one from the git remote.                |

You're asked for a name if you leave it out.

## add

Add skills to this project from your library, or from a git repository.

```bash
skilless add [skills...]
skilless add <repo> [skills...]
```

A repository is `owner/repo` or any git URL. Leave out the skills to pick from a list.

| Option            | Description                                                               |
| ----------------- | ------------------------------------------------------------------------- |
| `-g, --global`    | Make these skills global, so every project has them.                      |
| `--not-global`    | Stop treating these skills as global and unlink them from the user level. |
| `--copy`          | Write real files instead of linking to your library.                      |
| `--overwrite`     | From a repository: replace library skills with the same name.             |
| `-y, --yes`       | Skip confirmation prompts.                                                |
| `--project <key>` | Use this project key instead of the one from the git remote.              |

## update

Update skills added from a git repository to what the repository has now.

```bash
skilless update [skills...]
```

With no skills, updates every skill added from a repository.

| Option        | Description                                                |
| ------------- | ---------------------------------------------------------- |
| `-f, --force` | Replace skills you've edited too. Your copy is kept first. |
| `-y, --yes`   | Skip confirmation prompts.                                 |

## remove

Remove skills from this project. They stay in your library.

```bash
skilless remove <skills...>
```

| Option            | Description                                                  |
| ----------------- | ------------------------------------------------------------ |
| `--copy`          | Write real files instead of linking to your library.         |
| `--project <key>` | Use this project key instead of the one from the git remote. |

## delete

Delete skills from your library, which removes them from every project on every machine.

```bash
skilless delete <skills...>
```

| Option      | Description                |
| ----------- | -------------------------- |
| `-y, --yes` | Skip confirmation prompts. |

## list

List the skills in your library.

```bash
skilless list
```

| Option                | Description                                                |
| --------------------- | ---------------------------------------------------------- |
| `-p, --project [key]` | List this project's skills, or another project's, instead. |

## install

Install every skill added to this project, and your global skills at the user level. This is the command to run in [cloud agents](/docs/cloud/cloud-agents).

```bash
skilless install
```

| Option            | Description                                                  |
| ----------------- | ------------------------------------------------------------ |
| `--copy`          | Write real files instead of linking to your library.         |
| `--project <key>` | Use this project key instead of the one from the git remote. |

## vendor

Copy skills into this repo as real files to commit, instead of linking them. See [committing a skill](/docs/vendoring).

```bash
skilless vendor [skills...]
```

| Option            | Description                                                  |
| ----------------- | ------------------------------------------------------------ |
| `-y, --yes`       | Skip confirmation prompts.                                   |
| `--project <key>` | Use this project key instead of the one from the git remote. |

## import

Import a directory of existing skills into your library. Each subdirectory needs a `SKILL.md`.

```bash
skilless import <dir>
```

| Option        | Description                        |
| ------------- | ---------------------------------- |
| `--overwrite` | Replace skills that already exist. |
| `-y, --yes`   | Skip confirmation prompts.         |

## migrate

Move this project's skills into your library and link them back. Also offers your user-level skills, as global skills. See [moving existing skills in](/docs/migrating).

```bash
skilless migrate [skills...]
```

| Option                | Description                                                                      |
| --------------------- | -------------------------------------------------------------------------------- |
| `--user`              | Migrate your user-level skills too, without asking.                              |
| `--include-committed` | Move skills committed to this repo too, without asking. Their removal is staged. |
| `-y, --yes`           | Skip confirmation prompts.                                                       |

## auth

Sign in to skilless cloud, or sign out.

```bash
skilless auth
```

| Option            | Description                                                  |
| ----------------- | ------------------------------------------------------------ |
| `--token <token>` | Save a token directly, for when the browser can't reach you. |
| `--logout`        | Sign out on this machine.                                    |

## sync

Sync your library with skilless cloud in both directions, then update this project's skills and your global ones. See [sync](/docs/cloud/sync).

```bash
skilless sync
```

| Option      | Description                          |
| ----------- | ------------------------------------ |
| `--push`    | On a conflict, keep the local copy.  |
| `--pull`    | On a conflict, keep the remote copy. |
| `-y, --yes` | Skip confirmation prompts.           |

## config editor

Choose the editor `skilless create` opens new skills in.

```bash
skilless config editor [editor]
```

Leave out the editor to pick from the ones installed. The editors skilless knows are `cursor`, `vscode`, `windsurf`, `zed`, `sublime`, `neovim` and `vim`.

| Option    | Description                           |
| --------- | ------------------------------------- |
| `--unset` | Stop opening new skills in an editor. |

## Environment variables

| Variable         | Description                                                        |
| ---------------- | ------------------------------------------------------------------ |
| `SKILLESS_TOKEN` | A token to authenticate with. Takes priority over `skilless auth`. |
| `SKILLESS_HOME`  | Where your library lives. Defaults to `~/.skilless`.               |
| `SKILLESS_TRACE` | Set to `1` to print a full stack trace when a command fails.       |
