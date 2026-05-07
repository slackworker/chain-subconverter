#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
MAIN_BRANCH=${CHAIN_SUBCONVERTER_MAIN_BRANCH:-main}
TEMP_DIR=

log() {
  printf '[rebase-branch] %s\n' "$*"
}

fail() {
  printf '[rebase-branch] ERROR: %s\n' "$*" >&2
  exit 1
}

cleanup() {
  local status=$?

  if [[ "$status" -eq 0 && -n "$TEMP_DIR" && -d "$TEMP_DIR" ]]; then
    rm -rf "$TEMP_DIR"
  elif [[ "$status" -ne 0 && -n "$TEMP_DIR" && -d "$TEMP_DIR" ]]; then
    log "temporary worktrees are preserved for inspection: $TEMP_DIR"
  fi

  exit "$status"
}

trap cleanup EXIT

branch_worktree_path() {
  local branch=$1
  local worktree_path=
  local branch_ref=

  while IFS= read -r line; do
    case "$line" in
      worktree\ *)
        worktree_path=${line#worktree }
        ;;
      branch\ *)
        branch_ref=${line#branch }
        if [[ "$branch_ref" == "refs/heads/$branch" ]]; then
          printf '%s\n' "$worktree_path"
          return 0
        fi
        ;;
    esac
  done < <(git -C "$ROOT_DIR" worktree list --porcelain)

  return 1
}

require_clean_worktree() {
  local path=$1
  local branch=$2

  if ! git -C "$path" diff --quiet || ! git -C "$path" diff --cached --quiet ||
    [[ -n "$(git -C "$path" ls-files --others --exclude-standard)" ]]; then
    fail "'$branch' worktree has uncommitted changes: $path"
  fi
}

rebase_branch() {
  local branch=$1
  local path=
  local created_temp_worktree=0

  git -C "$ROOT_DIR" show-ref --verify --quiet "refs/heads/$branch" ||
    fail "local branch '$branch' does not exist"

  if path=$(branch_worktree_path "$branch"); then
    log "rebasing '$branch' in existing worktree: $path"
  else
    if [[ -z "$TEMP_DIR" ]]; then
      TEMP_DIR=$(mktemp -d)
    fi

    path="$TEMP_DIR/$branch"
    log "creating temporary worktree for '$branch': $path"
    git -C "$ROOT_DIR" worktree add "$path" "$branch" >/dev/null
    created_temp_worktree=1
  fi

  require_clean_worktree "$path" "$branch"

  if ! git -C "$path" rebase "$MAIN_BRANCH"; then
    fail "rebase failed for '$branch'; resolve it in: $path"
  fi

  if [[ "$created_temp_worktree" -eq 1 ]]; then
    git -C "$ROOT_DIR" worktree remove "$path" >/dev/null
    log "removed temporary worktree for '$branch'"
  fi
}

git -C "$ROOT_DIR" rev-parse --is-inside-work-tree >/dev/null
git -C "$ROOT_DIR" show-ref --verify --quiet "refs/heads/$MAIN_BRANCH" ||
  fail "local main branch '$MAIN_BRANCH' does not exist"

branches=("$@")
if [[ "${#branches[@]}" -eq 0 ]]; then
  branches=(dev)
fi

for branch in "${branches[@]}"; do
  rebase_branch "$branch"
done

log "done"
