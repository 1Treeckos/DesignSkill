#!/usr/bin/env bash
set -euo pipefail

SKILLS_DIR="${HOME}/.claude/skills"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NAME="ui-change-preview"
DEST="${SKILLS_DIR}/${NAME}"

if [[ -d "$DEST" && "${1:-}" != "--force" ]]; then
  echo "  ${NAME} is already installed at ${DEST}"
  echo "  Re-run with --force to overwrite."
  exit 0
fi

mkdir -p "${DEST}/scripts"
cp "${REPO_DIR}/SKILL.md" "${DEST}/SKILL.md"
cp "${REPO_DIR}/scripts/"*.mjs "${DEST}/scripts/"

echo "  installed ${NAME} -> ${DEST}"
echo ""
if ! command -v node >/dev/null 2>&1; then
  echo "  ! Node was not found on PATH. This skill needs Node 18+."
else
  node -e "try{require.resolve('playwright');console.log('  playwright: found')}catch(e){console.log('  ! playwright not found. Install with:\n      npm i -D playwright && npx playwright install chromium')}"
fi
echo ""
echo "  Restart Claude Code (or reload the window) to pick it up."
