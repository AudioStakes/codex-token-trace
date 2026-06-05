#!/bin/sh
set -eu

root="$(git rev-parse --show-toplevel 2>/dev/null || true)"

if [ -z "$root" ]; then
  printf '%s\n' '{"continue":true}'
  exit 0
fi

mkdir -p "$root/.codex/state"

git -C "$root" status --porcelain=v1 > "$root/.codex/state/git-start-status"

printf '%s\n' '{"continue":true}'
