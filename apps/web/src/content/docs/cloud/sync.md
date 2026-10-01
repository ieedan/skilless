---
title: Sync
description: Keep your library the same on every machine with skilless cloud.
---

The CLI works entirely on its own. Sign in to skilless cloud when you want your library on more than one machine, in your cloud agents, or in the browser.

## Sign in

```bash
skilless auth
```

This opens your browser to sign in and saves the session on this machine. If the browser can't reach your machine, create a token in your [settings](/settings) and save it directly:

```bash
skilless auth --token <token>
```

Sign out with `skilless auth --logout`.

## Sync your library

```bash
skilless sync
```

Sync runs in both directions. New skills and edits go up from this machine and down from your others, and a skill deleted in one place is deleted everywhere. It then relinks this project's skills and your global ones to match.

## Between syncs

Every other command works from what is on this machine, so it finishes right away. What it changes (a new skill, an edit, a skill added to a project, one made global or deleted) is sent to skilless cloud by a process that runs in the background after the command finishes. If that can't reach the server, the change waits and goes with your next command, and skilless tells you.

The background process also checks every so often for changes made somewhere else, like on another machine or on skilless.dev. When it finds some, your next command says so, and you run `skilless sync` to bring them here. Nothing comes down until you ask for it.

To read the latest from skilless cloud for one command, pass `--sync`:

```bash
skilless list --sync
```

Set `SKILLESS_BACKGROUND=0` to turn the background process off. Your changes then wait for `skilless sync`.

## Conflicts

If the same skill changed in two places since the last sync, the most recent edit wins. The other copy isn't thrown away: it's saved under `~/.skilless/conflicts` and sync tells you where.

To choose instead, pass `--push` to keep the copy on this machine or `--pull` to keep the one from the cloud.

## In the browser

Once you're signed in, [skilless.dev](/my-skills) shows your library. You can read and edit skills there, download them, restore ones you deleted in the last 30 days, and see your projects and the skills added to each.
