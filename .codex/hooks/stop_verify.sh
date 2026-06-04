#!/usr/bin/env sh
set -eu

cd "$(git rev-parse --show-toplevel)"

if ! npm run fix --silent >/dev/null 2>&1; then
  cat >&2 <<'EOF_ERROR'
Auto-fix failed. Run npm run fix and fix the reported issue.
EOF_ERROR
  exit 2
fi

if ! npm run verify --silent >/dev/null; then
  exit 2
fi

exit 0
