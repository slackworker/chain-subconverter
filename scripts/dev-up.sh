#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
WEB_DIR="$ROOT_DIR/web"
TMP_DIR="$ROOT_DIR/.tmp/dev-up"
RUNTIME_FILE="$TMP_DIR/runtime.env"
BACKEND_LOG="$TMP_DIR/backend.log"
SCHEME=${1:-a}

SUBCONVERTER_IMAGE=${CHAIN_SUBCONVERTER_SUBCONVERTER_IMAGE:-ghcr.io/slackworker/subconverter:integration-chain-subconverter}
SUBCONVERTER_PORT=${CHAIN_SUBCONVERTER_DEV_UP_SUBCONVERTER_PORT:-25500}
BACKEND_PORT=${CHAIN_SUBCONVERTER_DEV_UP_BACKEND_PORT:-11200}
FRONTEND_PORT=${CHAIN_SUBCONVERTER_DEV_UP_FRONTEND_PORT:-5173}
STALE_SUBCONVERTER_PORTS=(25501 25502 25503)
STALE_BACKEND_PORTS=(11201 11202 11203)
STALE_FRONTEND_PORTS=(5176)

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

ensure_frontend_dependencies() {
  if [[ -x "$WEB_DIR/node_modules/.bin/vite" ]]; then
    return 0
  fi

  if [[ -f "$WEB_DIR/package-lock.json" ]]; then
    log "frontend dependencies missing in $WEB_DIR; running npm ci for this worktree"
    (cd "$WEB_DIR" && npm ci)
  else
    log "frontend dependencies missing in $WEB_DIR; running npm install for this worktree"
    (cd "$WEB_DIR" && npm install)
  fi

  [[ -x "$WEB_DIR/node_modules/.bin/vite" ]] ||
    fail "frontend dependencies are still incomplete in $WEB_DIR after install"
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

process_cmdline() {
  local pid=$1

  if [[ ! -r "/proc/${pid}/cmdline" ]]; then
    return 1
  fi

  tr '\0' ' ' <"/proc/${pid}/cmdline" | sed 's/[[:space:]]\+$//'
}

process_cwd() {
  local pid=$1

  if [[ ! -L "/proc/${pid}/cwd" ]]; then
    return 1
  fi

  readlink -f "/proc/${pid}/cwd"
}

describe_listener_for_port() {
  local port=$1
  local pid
  local cmdline=""
  local cwd=""

  pid=$(listener_pid_for_port "$port")
  if [[ -z "$pid" ]]; then
    printf 'port %s is busy' "$port"
    return 0
  fi

  cmdline=$(process_cmdline "$pid" 2>/dev/null || true)
  cwd=$(process_cwd "$pid" 2>/dev/null || true)

  if [[ -n "$cwd" ]]; then
    printf 'pid=%s cmd=%q cwd=%q' "$pid" "${cmdline:-unknown}" "$cwd"
    return 0
  fi

  printf 'pid=%s cmd=%q' "$pid" "${cmdline:-unknown}"
}

stop_listener_for_port() {
  local port=$1
  local label=$2
  local pid
  local attempt=1

  pid=$(listener_pid_for_port "$port")
  if [[ -z "$pid" ]]; then
    return 0
  fi

  log "stopping ${label} on port ${port} ($(describe_listener_for_port "$port"))"
  kill "$pid" 2>/dev/null || true

  while kill -0 "$pid" 2>/dev/null; do
    if (( attempt >= 10 )); then
      kill -9 "$pid" 2>/dev/null || true
      break
    fi
    sleep 1
    attempt=$((attempt + 1))
  done

  if is_port_busy "$port"; then
    fail "could not free ${label} port ${port}; still occupied by $(describe_listener_for_port "$port")"
  fi
}

frontend_process_belongs_to_workspace() {
  local pid=$1
  local cwd=""
  local cmdline=""

  cwd=$(process_cwd "$pid" 2>/dev/null || true)
  cmdline=$(process_cmdline "$pid" 2>/dev/null || true)

  [[ "$cwd" == "$ROOT_DIR/web" ]] && [[ "$cmdline" == *vite* || "$cmdline" == *node* ]]
}

frontend_process_matches_runtime() {
  local pid=$1

  frontend_process_belongs_to_workspace "$pid" &&
    process_env_matches "$pid" VITE_CHAIN_SUBCONVERTER_API_PROXY_TARGET "http://127.0.0.1:${BACKEND_PORT}"
}

backend_process_matches_dev_up() {
  local pid=$1
  process_env_matches "$pid" CHAIN_SUBCONVERTER_DEV_UP "$DEV_UP_BACKEND_MARKER"
}

backend_process_matches_workspace() {
  local pid=$1
  local cwd=""
  local cmdline=""

  cwd=$(process_cwd "$pid" 2>/dev/null || true)
  cmdline=$(process_cmdline "$pid" 2>/dev/null || true)

  [[ "$cwd" == "$ROOT_DIR" ]] && [[ "$cmdline" == *server* || "$cmdline" == *go-build* ]]
}

fail_fixed_port_conflict() {
  local label=$1
  local port=$2

  fail "${label} requires fixed port ${port}, but it is occupied by $(describe_listener_for_port "$port"). Close the conflicting process or task and rerun; this script no longer falls back to adjacent ports."
}

cleanup_stale_frontends() {
  local port
  local pid

  for port in "${STALE_FRONTEND_PORTS[@]}"; do
    if ! is_port_busy "$port"; then
      continue
    fi

    pid=$(listener_pid_for_port "$port")
    if [[ -n "$pid" ]] && frontend_process_belongs_to_workspace "$pid"; then
      stop_listener_for_port "$port" "stale workspace frontend"
    fi
  done
}

cleanup_stale_backends() {
  local port
  local pid

  for port in "${STALE_BACKEND_PORTS[@]}"; do
    if ! is_port_busy "$port"; then
      continue
    fi

    pid=$(listener_pid_for_port "$port")
    if [[ -n "$pid" ]] && { backend_process_matches_dev_up "$pid" || backend_process_matches_workspace "$pid"; }; then
      stop_listener_for_port "$port" "stale dev-up backend"
    fi
  done
}

cleanup_stale_subconverter_containers() {
  local port
  local container_name

  for port in "${STALE_SUBCONVERTER_PORTS[@]}"; do
    container_name=$(find_subconverter_container_name "$port")
    if [[ -z "$container_name" ]]; then
      continue
    fi

    if [[ "$container_name" == chain-subconverter-dev-subconverter-* ]]; then
      log "removing stale subconverter container ${container_name} on port ${port}"
      docker rm -f "$container_name" >/dev/null 2>&1 || true
    fi
  done
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
ensure_frontend_dependencies

log "preparing local UI dev flow for scheme '$SCHEME'"

cleanup_stale_frontends
cleanup_stale_backends
cleanup_stale_subconverter_containers

if http_ready "http://127.0.0.1:${SUBCONVERTER_PORT}/version"; then
  log "reusing subconverter on port $SUBCONVERTER_PORT"
elif ! is_port_busy "$SUBCONVERTER_PORT"; then
  start_subconverter_container "$SUBCONVERTER_PORT"
else
  fail_fixed_port_conflict "subconverter" "$SUBCONVERTER_PORT"
fi

SUBCONVERTER_CONTAINER_NAME=$(find_subconverter_container_name "$SUBCONVERTER_PORT")
if [[ -z "$SUBCONVERTER_CONTAINER_NAME" ]]; then
  fail "could not resolve subconverter container for port $SUBCONVERTER_PORT"
fi

BACKEND_STATE="new"
if reusable_backend_ready "$BACKEND_PORT" "$SUBCONVERTER_PORT" "$SUBCONVERTER_CONTAINER_NAME"; then
  BACKEND_STATE="reused"
  log "reusing backend on port $BACKEND_PORT"
elif ! is_port_busy "$BACKEND_PORT"; then
  start_backend "$BACKEND_PORT" "$SUBCONVERTER_PORT" "$SUBCONVERTER_CONTAINER_NAME"
else
  EXISTING_BACKEND_PID=$(listener_pid_for_port "$BACKEND_PORT")
  if [[ -n "$EXISTING_BACKEND_PID" ]] && { backend_process_matches_dev_up "$EXISTING_BACKEND_PID" || backend_process_matches_workspace "$EXISTING_BACKEND_PID"; }; then
    stop_listener_for_port "$BACKEND_PORT" "stale workspace backend"
    start_backend "$BACKEND_PORT" "$SUBCONVERTER_PORT" "$SUBCONVERTER_CONTAINER_NAME"
  else
    fail_fixed_port_conflict "backend" "$BACKEND_PORT"
  fi
fi

FRONTEND_STATE="new"
if is_port_busy "$FRONTEND_PORT"; then
  EXISTING_FRONTEND_PID=$(listener_pid_for_port "$FRONTEND_PORT")
  if [[ -n "$EXISTING_FRONTEND_PID" ]] && frontend_process_matches_runtime "$EXISTING_FRONTEND_PID"; then
    FRONTEND_STATE="reused"
    log "reusing frontend on port $FRONTEND_PORT"
  elif [[ -n "$EXISTING_FRONTEND_PID" ]] && frontend_process_belongs_to_workspace "$EXISTING_FRONTEND_PID"; then
    stop_listener_for_port "$FRONTEND_PORT" "stale workspace frontend"
  else
    fail_fixed_port_conflict "frontend" "$FRONTEND_PORT"
  fi
fi

write_runtime_file "$SCHEME" "$SUBCONVERTER_PORT" "$BACKEND_PORT" "$FRONTEND_PORT"

log "runtime file written to $RUNTIME_FILE"
log "backend: http://localhost:${BACKEND_PORT}"
log "frontend: http://localhost:${FRONTEND_PORT}"
log "scheme:   http://localhost:${FRONTEND_PORT}/ui/${SCHEME}"
log "subconv:  http://127.0.0.1:${SUBCONVERTER_PORT}/sub?"
log "template: http://host.docker.internal:${BACKEND_PORT}"
log "backend log: $BACKEND_LOG"
if [[ "$FRONTEND_STATE" == "reused" ]]; then
  if [[ -n "$BACKEND_PID" ]]; then
    log "frontend already running on the fixed port; keeping this task open only to manage the backend lifecycle"
    tail -f /dev/null
  fi
  log "frontend already running on the fixed port; no new Vite process was started"
  exit 0
fi

log "close this terminal or stop the VS Code task to stop the local frontend/backend for this run"

cd "$WEB_DIR"
VITE_CHAIN_SUBCONVERTER_API_PROXY_TARGET="http://127.0.0.1:${BACKEND_PORT}" \
  npm run dev -- --host 0.0.0.0 --port "$FRONTEND_PORT" --strictPort