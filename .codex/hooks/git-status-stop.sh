#!/bin/sh
set -eu

root="$(git rev-parse --show-toplevel 2>/dev/null || true)"

if [ -z "$root" ]; then
  printf '%s\n' '{"continue":true}'
  exit 0
fi

state_file="$root/.codex/state/git-start-status"

before="$(cat "$state_file" 2>/dev/null || true)"
now="$(git -C "$root" status --porcelain=v1)"

if [ "$before" = "$now" ]; then
  printf '%s\n' '{"continue":true}'
  exit 0
fi

printf '%s\n' '{"decision":"block","reason":"Repository changes detected. Before finalizing, commit intentional changes, and push the branch. If not, explain why."}'