#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
REMOTE=${CHAIN_SUBCONVERTER_MAIN_REMOTE:-origin}
MAIN_BRANCH=${CHAIN_SUBCONVERTER_MAIN_BRANCH:-main}
COMMIT_MESSAGE=${1:-}

log() {
  printf '[commit-to-main] %s\n' "$*"
}

fail() {
  printf '[commit-to-main] ERROR: %s\n' "$*" >&2
  exit 1
}

require_clean_git_state() {
  [[ ! -d "$(git -C "$ROOT_DIR" rev-parse --git-path rebase-merge)" ]] || fail "rebase is already in progress"
  [[ ! -d "$(git -C "$ROOT_DIR" rev-parse --git-path rebase-apply)" ]] || fail "rebase or apply is already in progress"
  [[ ! -f "$(git -C "$ROOT_DIR" rev-parse --git-path MERGE_HEAD)" ]] || fail "merge is already in progress"
  [[ ! -f "$(git -C "$ROOT_DIR" rev-parse --git-path CHERRY_PICK_HEAD)" ]] || fail "cherry-pick is already in progress"
}

has_worktree_changes() {
  ! git -C "$ROOT_DIR" diff --quiet ||
    ! git -C "$ROOT_DIR" diff --cached --quiet ||
    [[ -n "$(git -C "$ROOT_DIR" ls-files --others --exclude-standard)" ]]
}

if [[ -z "$COMMIT_MESSAGE" ]]; then
  fail "commit message is required"
fi

git -C "$ROOT_DIR" rev-parse --is-inside-work-tree >/dev/null
require_clean_git_state

ORIGINAL_BRANCH=$(git -C "$ROOT_DIR" branch --show-current)
if [[ -z "$ORIGINAL_BRANCH" ]]; then
  fail "detached HEAD is not supported"
fi

if ! has_worktree_changes; then
  fail "no changes to commit"
fi

STASH_MESSAGE="commit-current-changes-to-main $(date -u +%Y%m%dT%H%M%SZ)"

log "stashing current changes from branch '$ORIGINAL_BRANCH'"
git -C "$ROOT_DIR" stash push --include-untracked --message "$STASH_MESSAGE" >/dev/null
STASH_REF='stash@{0}'

log "updating '$MAIN_BRANCH' from '$REMOTE/$MAIN_BRANCH'"
git -C "$ROOT_DIR" fetch "$REMOTE" "$MAIN_BRANCH"
git -C "$ROOT_DIR" switch "$MAIN_BRANCH"
git -C "$ROOT_DIR" pull --ff-only "$REMOTE" "$MAIN_BRANCH"

log "applying stashed changes onto '$MAIN_BRANCH'"
if ! git -C "$ROOT_DIR" stash pop "$STASH_REF"; then
  fail "stash apply had conflicts; resolve them on '$MAIN_BRANCH', then commit manually"
fi

git -C "$ROOT_DIR" add -A
if git -C "$ROOT_DIR" diff --cached --quiet; then
  fail "no staged changes after applying the stash"
fi

log "committing changes to '$MAIN_BRANCH'"
git -C "$ROOT_DIR" commit -m "$COMMIT_MESSAGE"

log "committed locally on '$MAIN_BRANCH' (not pushed); when ready: git push $REMOTE $MAIN_BRANCH"

if [[ "$ORIGINAL_BRANCH" != "$MAIN_BRANCH" ]]; then
  log "switching back to '$ORIGINAL_BRANCH'"
  git -C "$ROOT_DIR" switch "$ORIGINAL_BRANCH"
fi

log "done"
