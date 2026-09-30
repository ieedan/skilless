---
title: MCP server
description: Let agents read and manage your skilless library over MCP.
---

skilless cloud runs an MCP server, so any agent that supports MCP can work with your library directly. An agent can look up a skill, write a new one, fix a typo in an existing one, or add a skill to the project you're working in, all without leaving the conversation.

The server is at:

```plaintext
https://skilless.dev/mcp
```

It uses the Streamable HTTP transport. The first time a client connects, it opens your browser so you can sign in and approve it. You don't need to copy a token.

## Connect a client

### Claude Code

```bash
claude mcp add --transport http skilless https://skilless.dev/mcp
```

Then run `/mcp` in Claude Code, pick skilless, and sign in when your browser opens.

### Claude

In Claude's settings, open **Connectors**, choose **Add custom connector** and paste the server URL. Claude opens skilless so you can approve it.

### Cursor

Add the server to `~/.cursor/mcp.json`, or to `.cursor/mcp.json` to make it available in only one project:

```json
{
	"mcpServers": {
		"skilless": {
			"url": "https://skilless.dev/mcp"
		}
	}
}
```

### VS Code

Add the server to `.vscode/mcp.json`:

```json
{
	"servers": {
		"skilless": {
			"type": "http",
			"url": "https://skilless.dev/mcp"
		}
	}
}
```

### Other clients

Any client that supports remote MCP servers with OAuth can connect using just the URL. It finds how to sign in on its own.

## Connect with a token

For a client without OAuth support, or an agent running unattended, create a token in your [settings](/settings) and send it as a bearer token:

```bash
claude mcp add --transport http skilless https://skilless.dev/mcp \
  --header "Authorization: Bearer <token>"
```

Treat the token like a password: anyone with it can read and change your library.

## What agents can do

| Tool                        | What it does                                                           |
| --------------------------- | ---------------------------------------------------------------------- |
| `list_skills`               | Lists every skill in your library, with its description.               |
| `get_skill`                 | Reads a skill's files, or a single file from it.                       |
| `save_skill`                | Creates a skill, or replaces all of an existing skill's files.         |
| `write_skill_file`          | Adds or overwrites one file in a skill.                                |
| `delete_skill_file`         | Removes a file, or a folder, from a skill.                             |
| `delete_skill`              | Moves a skill to the trash and removes it from every project.          |
| `set_skill_global`          | Makes a skill [global](/docs/global-skills), or stops it being global. |
| `list_projects`             | Lists your projects and the skills added to each.                      |
| `get_project_skills`        | Lists the skills a project gets, including your global skills.         |
| `add_skill_to_project`      | Adds a skill to a project.                                             |
| `remove_skill_from_project` | Removes a skill from a project without deleting it.                    |

Projects are named by their git remote, like `github.com/ieedan/skilless`, the same way the CLI names them.

Changes made over MCP land in your cloud library. To get them on a machine, run `skilless sync` there, or `skilless install` in a cloud agent. If an agent deletes something you wanted, you can restore it from the trash on [skilless.dev](/skills) for 30 days.

## Revoke access

Every client you approve gets its own token, named after the client, in your [settings](/settings). Delete a token there to disconnect that client. The next time it connects, it asks you to approve it again.
