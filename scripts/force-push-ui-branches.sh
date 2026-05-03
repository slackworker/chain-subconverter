#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
REMOTE_NAME=${CHAIN_SUBCONVERTER_PUSH_REMOTE:-origin}
CONNECTIVITY_TIMEOUT_SECONDS=${CHAIN_SUBCONVERTER_PUSH_CONNECTIVITY_TIMEOUT_SECONDS:-5}
PUSH_TIMEOUT_SECONDS=${CHAIN_SUBCONVERTER_PUSH_TIMEOUT_SECONDS:-30}
PUSH_RETRY_COUNT=${CHAIN_SUBCONVERTER_PUSH_RETRY_COUNT:-2}

log() {
  printf '[force-push-ui] %s\n' "$*"
}

fail() {
  printf '[force-push-ui] ERROR: %s\n' "$*" >&2
  exit 1
}

github_host_for_remote() {
  local remote_url=

  remote_url=$(git -C "$ROOT_DIR" remote get-url "$REMOTE_NAME")
  case "$remote_url" in
    https://github.com/*|http://github.com/*)
      printf 'github.com\n'
      ;;
    git@github.com:*)
      printf 'github.com\n'
      ;;
    ssh://git@github.com/*)
      printf 'github.com\n'
      ;;
    *)
      printf '\n'
      ;;
  esac
}

diagnose_network() {
  local host=$1

  if [[ -z "$host" ]]; then
    return 0
  fi

  log "name resolution for ${host}:"
  getent hosts "$host" || true

  log "current TCP state for ${host}:443:"
  ss -tn state syn-sent,established "dst $(getent hosts "$host" | awk 'NR==1 { print $1 }'):443" 2>/dev/null || true
}

check_connectivity() {
  local host=$1

  if [[ -z "$host" ]]; then
    return 0
  fi

  if curl -I --silent --show-error --max-time "$CONNECTIVITY_TIMEOUT_SECONDS" "https://${host}" >/dev/null; then
    return 0
  fi

  diagnose_network "$host"
  fail "cannot reach https://${host} within ${CONNECTIVITY_TIMEOUT_SECONDS}s; aborting before push"
}

push_branch() {
  local branch=$1
  local attempt=1
  local host=$2
  local exit_code=0

  while (( attempt <= PUSH_RETRY_COUNT )); do
    log "force pushing ${branch} to ${REMOTE_NAME}/${branch} (attempt ${attempt}/${PUSH_RETRY_COUNT})"

    set +e
    timeout --foreground "$PUSH_TIMEOUT_SECONDS" \
      git -C "$ROOT_DIR" push --force-with-lease "$REMOTE_NAME" "${branch}:${branch}"
    exit_code=$?
    set -e

    if [[ "$exit_code" -eq 0 ]]; then
      return 0
    fi

    if [[ "$exit_code" -eq 124 ]]; then
      log "push timed out after ${PUSH_TIMEOUT_SECONDS}s"
      diagnose_network "$host"
    fi

    if (( attempt == PUSH_RETRY_COUNT )); then
      fail "push failed for ${branch} after ${PUSH_RETRY_COUNT} attempt(s)"
    fi

    attempt=$((attempt + 1))
    log "retrying ${branch} after a fresh connectivity check"
    check_connectivity "$host"
  done
}

main() {
  local branches=("$@")
  local host=

  git -C "$ROOT_DIR" rev-parse --is-inside-work-tree >/dev/null || fail "not a git repository: $ROOT_DIR"
  git -C "$ROOT_DIR" remote get-url "$REMOTE_NAME" >/dev/null || fail "remote '${REMOTE_NAME}' does not exist"

  if [[ "${#branches[@]}" -eq 0 ]]; then
    branches=(UI-A UI-B UI-C)
  fi

  host=$(github_host_for_remote)
  check_connectivity "$host"

  for branch in "${branches[@]}"; do
    push_branch "$branch" "$host"
  done

  log "done"
}

main "$@"