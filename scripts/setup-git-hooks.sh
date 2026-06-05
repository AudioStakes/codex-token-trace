#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"

install_hook() {
  local name="$1"
  local hook_src="$repo_root/scripts/git-hooks/$name"
  local hook_dst="$repo_root/.git/hooks/$name"

  if [ ! -f "$hook_src" ]; then
    echo "ERROR: hook script not found: $hook_src"
    exit 1
  fi

  mkdir -p "$repo_root/.git/hooks"
  ln -sf "$hook_src" "$hook_dst"
  chmod +x "$hook_src"

  echo "Installed $name:"
  echo "  $hook_dst -> $hook_src"
}

install_hook pre-commit
install_hook pre-push