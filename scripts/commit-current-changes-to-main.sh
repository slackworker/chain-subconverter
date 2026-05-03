#!/usr/bin/env bash

set -euo pipefail

if [[ "${COMMIT_TO_MAIN_STABLE_COPY:-0}" != "1" ]]; then
  SOURCE_SCRIPT=${BASH_SOURCE[0]}
  ROOT_DIR_FOR_STABLE=$(cd "$(dirname "$SOURCE_SCRIPT")/.." && pwd)
  STABLE_COPY_DIR=$(mktemp -d)
  STABLE_SCRIPT="$STABLE_COPY_DIR/$(basename "$SOURCE_SCRIPT")"

  cp "$SOURCE_SCRIPT" "$STABLE_SCRIPT"
  chmod +x "$STABLE_SCRIPT"

  export COMMIT_TO_MAIN_STABLE_COPY=1
  export COMMIT_TO_MAIN_ROOT_DIR="$ROOT_DIR_FOR_STABLE"
  export COMMIT_TO_MAIN_STABLE_DIR="$STABLE_COPY_DIR"
  exec bash "$STABLE_SCRIPT" "$@"
fi

ROOT_DIR=${COMMIT_TO_MAIN_ROOT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}
REMOTE=${CHAIN_SUBCONVERTER_MAIN_REMOTE:-origin}
MAIN_BRANCH=${CHAIN_SUBCONVERTER_MAIN_BRANCH:-main}
COMMIT_MESSAGE=${1:-}
TEMP_DIR=
MAIN_WORKTREE=
ORIGINAL_BRANCH=
STAGED_STASHED=0
UNSTAGED_STASHED=0
STABLE_COPY_DIR=${COMMIT_TO_MAIN_STABLE_DIR:-}

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

has_staged_changes() {
  ! git -C "$ROOT_DIR" diff --cached --quiet
}

has_unstaged_or_untracked_changes() {
  ! git -C "$ROOT_DIR" diff --quiet ||
    [[ -n "$(git -C "$ROOT_DIR" ls-files --others --exclude-standard)" ]]
}

clean_changes_matching_main() {
  local cleaned=0
  local path

  log "cleaning changes already present on '$MAIN_BRANCH' from '$ORIGINAL_BRANCH'"

  while IFS= read -r -d '' path; do
    if git -C "$ROOT_DIR" diff --quiet "$MAIN_BRANCH" -- "$path"; then
      git -C "$ROOT_DIR" restore -- "$path"
      log "cleared tracked change: $path"
      cleaned=1
    fi
  done < <(git -C "$ROOT_DIR" diff --name-only -z)

  while IFS= read -r -d '' path; do
    if git -C "$ROOT_DIR" cat-file -e "$MAIN_BRANCH:$path" 2>/dev/null &&
      [[ "$(git -C "$ROOT_DIR" hash-object -- "$path")" == "$(git -C "$ROOT_DIR" rev-parse "$MAIN_BRANCH:$path")" ]]; then
      git -C "$ROOT_DIR" clean -f -- "$path" >/dev/null
      log "cleared untracked change: $path"
      cleaned=1
    fi
  done < <(git -C "$ROOT_DIR" ls-files --others --exclude-standard -z)

  if [[ "$cleaned" -eq 0 ]]; then
    log "no current-branch changes matched '$MAIN_BRANCH'"
  fi
}

restore_saved_changes() {
  if [[ "$STAGED_STASHED" -eq 1 ]]; then
    log "restoring staged changes on '$ORIGINAL_BRANCH'"
    git -C "$ROOT_DIR" stash pop --index stash@{0} >/dev/null || true
    STAGED_STASHED=0
  fi

  if [[ "$UNSTAGED_STASHED" -eq 1 ]]; then
    log "restoring unstaged changes on '$ORIGINAL_BRANCH'"
    git -C "$ROOT_DIR" stash pop stash@{0} >/dev/null || true
    UNSTAGED_STASHED=0
  fi
}

cleanup() {
  local status=$?

  if [[ "$status" -ne 0 ]]; then
    if [[ -n "$ORIGINAL_BRANCH" ]]; then
      git -C "$ROOT_DIR" switch "$ORIGINAL_BRANCH" >/dev/null 2>&1 || true
    fi
    restore_saved_changes
  fi

  if [[ -n "$MAIN_WORKTREE" && -d "$MAIN_WORKTREE" ]]; then
    git -C "$ROOT_DIR" worktree remove --force "$MAIN_WORKTREE" >/dev/null 2>&1 || true
  fi

  if [[ -n "$TEMP_DIR" && -d "$TEMP_DIR" ]]; then
    rm -rf "$TEMP_DIR"
  fi

  if [[ -n "$STABLE_COPY_DIR" && -d "$STABLE_COPY_DIR" ]]; then
    rm -rf "$STABLE_COPY_DIR"
  fi

  exit "$status"
}

trap cleanup EXIT

if [[ -z "$COMMIT_MESSAGE" ]]; then
  fail "commit message is required"
fi

git -C "$ROOT_DIR" rev-parse --is-inside-work-tree >/dev/null
require_clean_git_state

ORIGINAL_BRANCH=$(git -C "$ROOT_DIR" branch --show-current)
if [[ -z "$ORIGINAL_BRANCH" ]]; then
  fail "detached HEAD is not supported"
fi

if ! has_staged_changes; then
  fail "no staged changes to commit"
fi

if [[ "$ORIGINAL_BRANCH" == "$MAIN_BRANCH" ]]; then
  log "committing staged changes on '$MAIN_BRANCH'"
  git -C "$ROOT_DIR" commit -m "$COMMIT_MESSAGE"
  log "committed locally on '$MAIN_BRANCH' (not pushed); when ready: git push $REMOTE $MAIN_BRANCH"
  exit 0
fi

TEMP_DIR=$(mktemp -d)
STAGED_PATCH="$TEMP_DIR/staged.patch"
git -C "$ROOT_DIR" diff --cached --binary >"$STAGED_PATCH"

STASH_SUFFIX="$(date -u +%Y%m%dT%H%M%SZ)"
if has_unstaged_or_untracked_changes; then
  log "temporarily stashing unstaged changes from '$ORIGINAL_BRANCH'"
  git -C "$ROOT_DIR" stash push --include-untracked --keep-index --message "commit-staged-to-main unstaged $STASH_SUFFIX" >/dev/null
  UNSTAGED_STASHED=1
fi

log "removing staged changes from '$ORIGINAL_BRANCH' after saving them"
git -C "$ROOT_DIR" stash push --staged --message "commit-staged-to-main staged $STASH_SUFFIX" >/dev/null
STAGED_STASHED=1

log "using local '$MAIN_BRANCH' without fetching from '$REMOTE'"
MAIN_WORKTREE="$TEMP_DIR/$MAIN_BRANCH-worktree"
if git -C "$ROOT_DIR" show-ref --verify --quiet "refs/heads/$MAIN_BRANCH"; then
  git -C "$ROOT_DIR" worktree add "$MAIN_WORKTREE" "$MAIN_BRANCH" >/dev/null
else
  fail "local '$MAIN_BRANCH' branch does not exist; create it before committing without network access"
fi

log "applying staged changes onto '$MAIN_BRANCH'"
if ! git -C "$MAIN_WORKTREE" apply --index "$STAGED_PATCH"; then
  fail "staged changes do not apply cleanly to '$MAIN_BRANCH'; original changes were restored"
fi

if git -C "$MAIN_WORKTREE" diff --cached --quiet; then
  fail "no staged changes after applying the patch"
fi

log "committing changes to '$MAIN_BRANCH'"
git -C "$MAIN_WORKTREE" commit -m "$COMMIT_MESSAGE"
git -C "$ROOT_DIR" worktree remove "$MAIN_WORKTREE" >/dev/null
MAIN_WORKTREE=

log "committed locally on '$MAIN_BRANCH' (not pushed); when ready: git push $REMOTE $MAIN_BRANCH"

log "dropping staged changes from '$ORIGINAL_BRANCH'"
git -C "$ROOT_DIR" stash drop stash@{0} >/dev/null
STAGED_STASHED=0

if [[ "$UNSTAGED_STASHED" -eq 1 ]]; then
  log "restoring unstaged changes on '$ORIGINAL_BRANCH'"
  UNSTAGED_STASHED=0
  if ! git -C "$ROOT_DIR" stash pop stash@{0}; then
    fail "committed to '$MAIN_BRANCH', but restoring unstaged changes had conflicts; resolve them on '$ORIGINAL_BRANCH'"
  fi
fi

clean_changes_matching_main

log "done"
