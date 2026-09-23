#!/usr/bin/env bash
# Runs `skilless install` at the start of every cloud session, so each repo gets
# its skills without committing a hook of its own. Never fails the session.

# locally your skills are already linked from the store
[ "$CLAUDE_CODE_REMOTE" = "true" ] || exit 0

if [ -z "$SKILLESS_TOKEN" ]; then
	echo "skilless: SKILLESS_TOKEN is not set in this environment, skipping install." >&2
	exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$PWD}" || exit 0

# SessionStart stdout is added to Claude's context, so keep the CLI's output out of it
npx -y skilless@latest install >&2 || echo "skilless: install failed, continuing without skills." >&2

exit 0
