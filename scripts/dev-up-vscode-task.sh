#!/usr/bin/env bash
# Used by VS Code/Cursor task "dev: up" so port/env wiring is not inlined in tasks.json
# (nested bash -c quoting breaks on case patterns containing '|').

set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
scheme="${1:-}"
# Default fixed ports (offset 0). Set CHAIN_SUBCONVERTER_DEV_UP_PORT_OFFSET=auto for
# legacy per-worktree auto offset, or a numeric offset for parallel worktrees.
port_offset_input="${2:-${CHAIN_SUBCONVERTER_DEV_UP_PORT_OFFSET:-0}}"

worktree_auto_port_offset() {
  local current_root
  local path
  local normalized_path
  local index=0
  local -a worktree_paths=()

  current_root=$(cd "$ROOT_DIR" && pwd -P)

  while IFS= read -r line; do
    case "$line" in
      worktree\ *)
        path=${line#worktree }
        if normalized_path=$(cd "$path" 2>/dev/null && pwd -P); then
          worktree_paths+=("$normalized_path")
        fi
        ;;
    esac
  done < <(git -C "$ROOT_DIR" worktree list --porcelain 2>/dev/null || true)

  if [[ "${#worktree_paths[@]}" -eq 0 ]]; then
    printf '0\n'
    return 0
  fi

  while IFS= read -r normalized_path; do
    if [[ "$normalized_path" == "$current_root" ]]; then
      printf '%s\n' "$((index * 10))"
      return 0
    fi
    index=$((index + 1))
  done < <(printf '%s\n' "${worktree_paths[@]}" | sort -u)

  printf '0\n'
}

case "$port_offset_input" in
  ''|auto)
    port_offset=$(worktree_auto_port_offset)
    ;;
  *)
    port_offset=$port_offset_input
    ;;
esac

if [[ -z "$port_offset" ]] || ! [[ "$port_offset" =~ ^[0-9]+$ ]]; then
  printf 'Unsupported dev port offset: %s\n' "$port_offset" >&2
  exit 1
fi

case "$scheme" in
  a) frontend_base=5173 ;;
  b) frontend_base=5174 ;;
  c) frontend_base=5175 ;;
  *)
    printf 'Unsupported UI scheme: %s\n' "$scheme" >&2
    exit 1
    ;;
esac

frontend_port=$((frontend_base + port_offset))
backend_port=$((11200 + port_offset))
subconverter_port=$((25500 + port_offset))

if [[ "$port_offset_input" == "auto" ]]; then
  printf '[dev-up-task] auto-selected port offset %s for worktree %s\n' "$port_offset" "$ROOT_DIR"
elif [[ "$port_offset" != "0" ]]; then
  printf '[dev-up-task] using port offset %s (worktree %s)\n' "$port_offset" "$ROOT_DIR"
fi

export CHAIN_SUBCONVERTER_DEV_UP_FRONTEND_PORT="$frontend_port"
export CHAIN_SUBCONVERTER_DEV_UP_BACKEND_PORT="$backend_port"
export CHAIN_SUBCONVERTER_DEV_UP_SUBCONVERTER_PORT="$subconverter_port"

exec "$ROOT_DIR/scripts/dev-up.sh" "$scheme"
