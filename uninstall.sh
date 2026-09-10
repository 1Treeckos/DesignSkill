#!/usr/bin/env bash
set -euo pipefail
DEST="${HOME}/.claude/skills/ui-change-preview"
if [[ -d "$DEST" ]]; then
  rm -rf "$DEST"
  echo "  removed ${DEST}"
else
  echo "  nothing to remove at ${DEST}"
fi
