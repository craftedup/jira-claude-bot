#!/usr/bin/env bash
# Install the jira-claude-bot Claude Code skill into ~/.claude/skills/
# so any Claude Code session can work JIRA tickets via the `context` command.
#
# Usage:  ./scripts/install-skill.sh
# Re-run any time to update to the latest version in this repo.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$SCRIPT_DIR/../skills/jira-claude-bot/SKILL.md"
DEST_DIR="$HOME/.claude/skills/jira-claude-bot"

if [[ ! -f "$SRC" ]]; then
  echo "error: cannot find $SRC — run this from a clone of the jira-claude-bot repo" >&2
  exit 1
fi

mkdir -p "$DEST_DIR"
cp "$SRC" "$DEST_DIR/SKILL.md"

echo "Installed jira-claude-bot skill to $DEST_DIR/SKILL.md"
echo "Open Claude Code in a project (with a .env holding JIRA_HOST / JIRA_EMAIL / JIRA_API_TOKEN)"
echo "and say e.g. \"work on PROJ-123\"."
