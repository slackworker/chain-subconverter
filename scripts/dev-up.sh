#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
TMP_DIR="$ROOT_DIR/.tmp/dev-up"
RUNTIME_FILE="$TMP_DIR/runtime.env"
BACKEND_LOG="$TMP_DIR/backend.log"
SCHEME=${1:-a}

SUBCONVERTER_IMAGE=${CHAIN_SUBCONVERTER_SUBCONVERTER_IMAGE:-ghcr.io/slackworker/subconverter:integration-chain-subconverter}
SUBCONVERTER_PORTS=(25500 25501 25502 25503)
BACKEND_PORTS=(11200 11201 11202 11203)
FRONTEND_PORTS=(5173 5174 5175 5176)

BACKEND_PID=""
DEV_UP_BACKEND_MARKER=1

log() {
  printf '[dev-up] %s\n' "$*"
}

fail() {
  printf '[dev-up] ERROR: %s\n' "$*" >&2
  exit 1
}

cleanup() {
  local exit_code=$?

  if [[ -n "$BACKEND_PID" ]] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    log "stopping local backend (pid=$BACKEND_PID)"
    kill "$BACKEND_PID" 2>/dev/null || true
    wait "$BACKEND_PID" 2>/dev/null || true
  fi

  if [[ $exit_code -ne 0 ]]; then
    log "exiting with status $exit_code"
  fi
}

require_command() {
  local command_name=$1
  if ! command -v "$command_name" >/dev/null 2>&1; then
    fail "missing required command: $command_name"
  fi
}

is_port_busy() {
  local port=$1
  ss -ltnH | awk '{print $4}' | grep -Eq "[:.]${port}$"
}

http_ready() {
  local url=$1
  curl -fsS --max-time 2 "$url" >/dev/null 2>&1
}

container_http_ready() {
  local container_name=$1
  local url=$2
  docker exec "$container_name" wget -q -T 2 -O /dev/null "$url" >/dev/null 2>&1
}

wait_for_http() {
  local url=$1
  local label=$2
  local attempts=${3:-30}

  local attempt=1
  while (( attempt <= attempts )); do
    if http_ready "$url"; then
      return 0
    fi
    sleep 1
    attempt=$((attempt + 1))
  done

  fail "$label did not become ready: $url"
}

wait_for_container_http() {
  local container_name=$1
  local url=$2
  local label=$3
  local attempts=${4:-30}

  local attempt=1
  while (( attempt <= attempts )); do
    if container_http_ready "$container_name" "$url"; then
      return 0
    fi
    sleep 1
    attempt=$((attempt + 1))
  done

  fail "$label did not become ready from $container_name: $url"
}

find_subconverter_container_name() {
  local port=$1
  docker ps --filter "publish=${port}" --format '{{.Names}}' | head -n 1
}

backend_http_address() {
  local port=$1
  printf '0.0.0.0:%s' "$port"
}

backend_public_base_url() {
  local port=$1
  printf 'http://localhost:%s' "$port"
}

backend_managed_template_base_url() {
  local port=$1
  printf 'http://host.docker.internal:%s' "$port"
}

backend_subconverter_base_url() {
  local port=$1
  printf 'http://127.0.0.1:%s/sub?' "$port"
}

listener_pid_for_port() {
  local port=$1
  ss -ltnpH "sport = :${port}" | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' | head -n 1
}

process_env_matches() {
  local pid=$1
  local name=$2
  local value=$3

  if [[ ! -r "/proc/${pid}/environ" ]]; then
    return 1
  fi

  tr '\0' '\n' <"/proc/${pid}/environ" | grep -Fxq "${name}=${value}"
}

backend_env_matches() {
  local port=$1
  local subconverter_port=$2
  local pid

  pid=$(listener_pid_for_port "$port")
  if [[ -z "$pid" ]]; then
    return 1
  fi

  process_env_matches "$pid" CHAIN_SUBCONVERTER_DEV_UP "$DEV_UP_BACKEND_MARKER" &&
    process_env_matches "$pid" CHAIN_SUBCONVERTER_HTTP_ADDRESS "$(backend_http_address "$port")" &&
    process_env_matches "$pid" CHAIN_SUBCONVERTER_PUBLIC_BASE_URL "$(backend_public_base_url "$port")" &&
    process_env_matches "$pid" CHAIN_SUBCONVERTER_MANAGED_TEMPLATE_BASE_URL "$(backend_managed_template_base_url "$port")" &&
    process_env_matches "$pid" CHAIN_SUBCONVERTER_SUBCONVERTER_BASE_URL "$(backend_subconverter_base_url "$subconverter_port")"
}

reusable_backend_ready() {
  local port=$1
  local subconverter_port=$2
  local container_name=$3

  http_ready "http://127.0.0.1:${port}/healthz" &&
    backend_env_matches "$port" "$subconverter_port" &&
    container_http_ready "$container_name" "$(backend_managed_template_base_url "$port")/healthz"
}

select_reusable_or_free_port() {
  local health_path=$1
  shift
  local ports=("$@")
  local port=""

  for port in "${ports[@]}"; do
    if [[ -n "$health_path" ]] && http_ready "http://127.0.0.1:${port}${health_path}"; then
      printf '%s reused\n' "$port"
      return 0
    fi
  done

  for port in "${ports[@]}"; do
    if ! is_port_busy "$port"; then
      printf '%s new\n' "$port"
      return 0
    fi
  done

  return 1
}

select_free_port() {
  local ports=("$@")
  local port=""

  for port in "${ports[@]}"; do
    if ! is_port_busy "$port"; then
      printf '%s\n' "$port"
      return 0
    fi
  done

  return 1
}

select_reusable_or_free_backend_port() {
  local subconverter_port=$1
  local container_name=$2
  local port=""

  for port in "${BACKEND_PORTS[@]}"; do
    if reusable_backend_ready "$port" "$subconverter_port" "$container_name"; then
      printf '%s reused\n' "$port"
      return 0
    fi
  done

  for port in "${BACKEND_PORTS[@]}"; do
    if ! is_port_busy "$port"; then
      printf '%s new\n' "$port"
      return 0
    fi
  done

  return 1
}

start_subconverter_container() {
  local port=$1
  local container_name="chain-subconverter-dev-subconverter-${port}"

  if docker inspect "$container_name" >/dev/null 2>&1; then
    log "removing stale subconverter container $container_name"
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi

  log "starting subconverter container on port $port"
  docker run -d \
    --name "$container_name" \
    --restart unless-stopped \
    --health-cmd 'wget -q -O /dev/null http://127.0.0.1:25500/version || exit 1' \
    --health-interval 10s \
    --health-timeout 5s \
    --health-retries 5 \
    --health-start-period 10s \
    -p "${port}:25500" \
    "$SUBCONVERTER_IMAGE" >/dev/null

  wait_for_http "http://127.0.0.1:${port}/version" "subconverter"
}

start_backend() {
  local backend_port=$1
  local subconverter_port=$2
  local container_name=$3

  : >"$BACKEND_LOG"

  log "starting local backend on port $backend_port"
  (
    cd "$ROOT_DIR"
    CHAIN_SUBCONVERTER_DEV_UP="$DEV_UP_BACKEND_MARKER" \
      CHAIN_SUBCONVERTER_HTTP_ADDRESS="$(backend_http_address "$backend_port")" \
      CHAIN_SUBCONVERTER_PUBLIC_BASE_URL="$(backend_public_base_url "$backend_port")" \
      CHAIN_SUBCONVERTER_MANAGED_TEMPLATE_BASE_URL="$(backend_managed_template_base_url "$backend_port")" \
      CHAIN_SUBCONVERTER_SUBCONVERTER_BASE_URL="$(backend_subconverter_base_url "$subconverter_port")" \
      CHAIN_SUBCONVERTER_FRONTEND_DIST_DIR="web/dist" \
      CHAIN_SUBCONVERTER_SHORT_LINK_DB_PATH="data/short-links.sqlite3" \
      go run ./cmd/server
  ) >"$BACKEND_LOG" 2>&1 &

  BACKEND_PID=$!

  if ! wait_for_http "http://127.0.0.1:${backend_port}/healthz" "backend" 30; then
    tail -n 50 "$BACKEND_LOG" >&2 || true
    return 1
  fi

  if ! wait_for_container_http "$container_name" "$(backend_managed_template_base_url "$backend_port")/healthz" "backend-from-subconverter" 30; then
    tail -n 50 "$BACKEND_LOG" >&2 || true
    return 1
  fi
}

write_runtime_file() {
  local scheme=$1
  local subconverter_port=$2
  local backend_port=$3
  local frontend_port=$4

  cat >"$RUNTIME_FILE" <<EOF
SCHEME=${scheme}
SUBCONVERTER_BASE_URL=http://127.0.0.1:${subconverter_port}/sub?
BACKEND_URL=http://localhost:${backend_port}
MANAGED_TEMPLATE_BASE_URL=http://host.docker.internal:${backend_port}
FRONTEND_URL=http://localhost:${frontend_port}
SCHEME_URL=http://localhost:${frontend_port}/ui/${scheme}
BACKEND_LOG=${BACKEND_LOG}
EOF
}

case "$SCHEME" in
  a|b|c)
    ;;
  *)
    fail "unsupported scheme '$SCHEME' (expected one of: a, b, c)"
    ;;
esac

trap cleanup EXIT INT TERM

mkdir -p "$TMP_DIR"

require_command go
require_command node
require_command npm
require_command docker
require_command curl
require_command ss

log "preparing local UI dev flow for scheme '$SCHEME'"

if ! read -r SUBCONVERTER_PORT SUBCONVERTER_STATE < <(select_reusable_or_free_port "/version" "${SUBCONVERTER_PORTS[@]}"); then
  fail "no reusable or free subconverter port found in pool 25500-25503"
fi

if [[ "$SUBCONVERTER_STATE" == "reused" ]]; then
  log "reusing subconverter on port $SUBCONVERTER_PORT"
else
  start_subconverter_container "$SUBCONVERTER_PORT"
fi

SUBCONVERTER_CONTAINER_NAME=$(find_subconverter_container_name "$SUBCONVERTER_PORT")
if [[ -z "$SUBCONVERTER_CONTAINER_NAME" ]]; then
  fail "could not resolve subconverter container for port $SUBCONVERTER_PORT"
fi

if ! read -r BACKEND_PORT BACKEND_STATE < <(select_reusable_or_free_backend_port "$SUBCONVERTER_PORT" "$SUBCONVERTER_CONTAINER_NAME"); then
  fail "no reusable or free backend port found in pool 11200-11203"
fi

if [[ "$BACKEND_STATE" == "reused" ]]; then
  log "reusing backend on port $BACKEND_PORT"
else
  start_backend "$BACKEND_PORT" "$SUBCONVERTER_PORT" "$SUBCONVERTER_CONTAINER_NAME"
fi

if ! FRONTEND_PORT=$(select_free_port "${FRONTEND_PORTS[@]}"); then
  fail "no free frontend port found in pool 5173-5176"
fi

write_runtime_file "$SCHEME" "$SUBCONVERTER_PORT" "$BACKEND_PORT" "$FRONTEND_PORT"

log "runtime file written to $RUNTIME_FILE"
log "backend: http://localhost:${BACKEND_PORT}"
log "frontend: http://localhost:${FRONTEND_PORT}"
log "scheme:   http://localhost:${FRONTEND_PORT}/ui/${SCHEME}"
log "subconv:  http://127.0.0.1:${SUBCONVERTER_PORT}/sub?"
log "template: http://host.docker.internal:${BACKEND_PORT}"
log "backend log: $BACKEND_LOG"
log "close this terminal or stop the VS Code task to stop the local frontend/backend for this run"

cd "$ROOT_DIR/web"
VITE_CHAIN_SUBCONVERTER_API_PROXY_TARGET="http://127.0.0.1:${BACKEND_PORT}" \
  npm run dev -- --host 0.0.0.0 --port "$FRONTEND_PORT" --strictPort