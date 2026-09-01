#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$script_dir"

if [[ $# -eq 0 ]]; then
  echo "Usage: ./commit-all.sh <commit message>" >&2
  exit 1
fi

commit_message="$*"

if [[ -z "${commit_message//[[:space:]]/}" ]]; then
  echo "Commit message must not be empty." >&2
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Current directory is not inside a Git repository." >&2
  exit 1
fi

repo_root="$(git rev-parse --show-toplevel)"

if [[ "$script_dir" != "$repo_root" ]]; then
  echo "This script must be located at the repository root." >&2
  exit 1
fi

if [[ -n "$(git diff --name-only --diff-filter=U)" ]]; then
  echo "Unresolved merge conflicts detected; commit aborted." >&2
  exit 1
fi

if [[ -z "$(git status --porcelain)" ]]; then
  echo "No changes to commit."
  exit 0
fi

git diff --check
git add -A

if git diff --cached --quiet; then
  echo "No changes to commit."
  exit 0
fi

git commit -m "$commit_message"

echo "Created commit; changes were not pushed."
