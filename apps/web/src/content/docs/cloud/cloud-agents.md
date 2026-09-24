---
title: Cloud agents
description: Give agents running in cloud containers the same skills your projects have locally.
---

A cloud agent starts in a fresh container with a clone of your repo and nothing else. With skilless cloud, one command gives it the skills you added to that project, plus your global skills.

## Create a token

Create a token in your [settings](/settings) and add it to the agent's environment as `SKILLESS_TOKEN`. Treat it like a password: anyone with it can read your library.

## Install in the setup step

Add this to the environment's setup script:

```bash
npx skilless install
```

skilless works out the project from the repository's remote, then installs every skill added to it and your global skills at the user level. There's no library in a fresh container, so it writes real files rather than links.

## Claude Code on the web

For Claude Code, the skilless plugin runs `skilless install` at the start of every cloud session, in any repo, so you don't need a setup script per repository. Add the marketplace and install the plugin:

```plaintext
/plugin marketplace add ieedan/skilless
/plugin install skilless@skilless
```

The plugin only runs in cloud sessions. On your own machine, your skills are already linked from your library. If `SKILLESS_TOKEN` isn't set, it skips the install and the session carries on without skills.
