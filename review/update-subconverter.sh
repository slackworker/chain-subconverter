#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
	printf 'usage: %s\n' "${0##*/}" >&2
}

compose_args() {
	printf '%s\n' \
		-f "$ROOT_DIR/deploy/docker-compose.yml" \
		-f "$ROOT_DIR/review/docker-compose.subconverter.yml"
}

wait_subconverter() {
	printf '[3/3] Waiting for http://localhost:25511/version\n'
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

main() {
	if [[ $# -ne 0 ]]; then
		usage
		return 1
	fi

	cd "$ROOT_DIR"

	mapfile -t args < <(compose_args)

	printf '[1/3] Pulling latest review subconverter image\n'
	docker compose "${args[@]}" pull subconverter

	printf '[2/3] Recreating review subconverter on localhost:25511\n'
	docker compose "${args[@]}" up -d --force-recreate subconverter

	wait_subconverter
}

main "$@"
