#!/usr/bin/env bash
# Used by VS Code/Cursor task "dev: up" so port/env wiring is not inlined in tasks.json
# (nested bash -c quoting breaks on case patterns containing '|').

set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
scheme="${1:-}"
port_offset="${2:-}"

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

export CHAIN_SUBCONVERTER_DEV_UP_FRONTEND_PORT="$frontend_port"
export CHAIN_SUBCONVERTER_DEV_UP_BACKEND_PORT="$backend_port"
export CHAIN_SUBCONVERTER_DEV_UP_SUBCONVERTER_PORT="$subconverter_port"

exec "$ROOT_DIR/scripts/dev-up.sh" "$scheme"
