#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CASE_DIR="$ROOT_DIR/review/cases/3pass-ss2022-test-subscription"
SUBCONVERTER_BASE_URL="${CHAIN_SUBCONVERTER_SUBCONVERTER_BASE_URL:-http://localhost:25511/sub?}"
SUBCONVERTER_TIMEOUT="${CHAIN_SUBCONVERTER_FRONTEND_REVIEW_SUBCONVERTER_TIMEOUT:-60s}"
PUBLIC_BASE_URL="${CHAIN_SUBCONVERTER_FRONTEND_REVIEW_PUBLIC_BASE_URL:-http://localhost:11200}"

usage() {
	printf 'usage: %s <stage1|stage2>\n' "${0##*/}" >&2
}

compose_args() {
	printf '%s\n' \
		-f "$ROOT_DIR/deploy/docker-compose.yml" \
		-f "$ROOT_DIR/review/docker-compose.subconverter.yml"
}

subconverter_up() {
	if curl -fsS http://localhost:25511/version >/dev/null 2>&1; then
		printf 'Reusing existing review subconverter at http://localhost:25511/sub?\n'
		return 0
	fi

	mapfile -t args < <(compose_args)
	printf '[1/2] Starting review subconverter on localhost:25511\n'
	docker compose "${args[@]}" up -d subconverter

	printf '[2/2] Waiting for http://localhost:25511/version\n'
	for _ in $(seq 1 60); do
		if curl -fsS http://localhost:25511/version >/dev/null 2>&1; then
			printf 'Ready: http://localhost:25511/sub?\n'
			return 0
		fi
		sleep 1
	done

	printf 'subconverter did not become healthy within 60 seconds\n' >&2
	return 1
}

run_action() {
	local action="$1"
	subconverter_up

	CHAIN_SUBCONVERTER_SUBCONVERTER_BASE_URL="$SUBCONVERTER_BASE_URL" \
	CHAIN_SUBCONVERTER_SUBCONVERTER_TIMEOUT="$SUBCONVERTER_TIMEOUT" \
	CHAIN_SUBCONVERTER_FRONTEND_REVIEW_PUBLIC_BASE_URL="$PUBLIC_BASE_URL" \
		go run ./cmd/frontend-review \
			"$action" \
			--case-dir "$CASE_DIR"
}

main() {
	if [[ $# -ne 1 ]]; then
		usage
		return 1
	fi

	cd "$ROOT_DIR"

	case "$1" in
		stage1|stage2)
			run_action "$1"
			;;
		*)
			usage
			return 1
			;;
	esac
}

main "$@"