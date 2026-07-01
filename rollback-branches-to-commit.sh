#!/usr/bin/env bash
set -euo pipefail

# Destructively reset both dev and main to a chosen commit, then force-push.
# Intended only for exceptional history rollback cases.

require_clean_tree() {
  if [[ -n "$(git status --short)" ]]; then
    echo "ERROR: working tree is not clean. Commit, stash, or discard changes first."
    git --no-pager status --short
    exit 1
  fi
}

confirm() {
  local prompt="$1"
  local reply
  read -r -p "$prompt" reply
  [[ "$reply" == "yes" ]]
}

current_branch="$(git branch --show-current)"
if [[ "$current_branch" != "dev" ]]; then
  echo "ERROR: start from dev. Current branch: $current_branch"
  exit 1
fi

require_clean_tree

git fetch origin

echo "Recent history:"
git --no-pager log --oneline --decorate --graph --all -8
echo

read -r -p "Commit to reset dev and main to: " target
if [[ -z "$target" ]]; then
  echo "ERROR: no commit provided."
  exit 1
fi

if ! git rev-parse --verify --quiet "$target^{commit}" >/dev/null; then
  echo "ERROR: '$target' is not a valid commit."
  exit 1
fi

target_full="$(git rev-parse "$target^{commit}")"
target_subject="$(git log -1 --format='%h %s' "$target_full")"

echo
echo "Target commit: $target_subject"
echo "This will:"
echo "  - reset local dev to $target_full"
echo "  - force-push origin/dev"
echo "  - reset local main to $target_full"
echo "  - force-push origin/main"
echo

if ! confirm "Type 'yes' to continue: "; then
  echo "Aborted."
  exit 1
fi

if ! confirm "Type 'yes' again to confirm destructive force-pushes: "; then
  echo "Aborted."
  exit 1
fi

git reset --hard "$target_full"
git push --force-with-lease origin dev

git branch -f main "$target_full"
git push --force-with-lease origin main

git switch dev >/dev/null

echo
echo "Done. dev and main now point to: $target_subject"
git --no-pager log --oneline --decorate -3
