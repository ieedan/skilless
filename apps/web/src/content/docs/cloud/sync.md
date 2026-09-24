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

Changes you make while offline are queued and sent the next time a command reaches the server.

## Conflicts

If the same skill changed in two places since the last sync, the most recent edit wins. The other copy isn't thrown away: it's saved under `~/.skilless/conflicts` and sync tells you where.

To choose instead, pass `--push` to keep the copy on this machine or `--pull` to keep the one from the cloud.

## In the browser

Once you're signed in, [skilless.dev](/skills) shows your library. You can read and edit skills there, download them, restore ones you deleted in the last 30 days, and see your projects and the skills added to each.
