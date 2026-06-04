#!/usr/bin/env sh
set -eu

cd "$(git rev-parse --show-toplevel)"

npm run fix >&2

if ! npm run verify >&2; then
  cat >&2 <<'EOF_ERROR'
Repository verification failed.

Run npm run fix and npm run verify, fix the failures, and do not report completion until the verification gate passes.
EOF_ERROR
  exit 2
fi

exit 0
