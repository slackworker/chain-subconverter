#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
WEB_DIR="$ROOT_DIR/web"
SCHEME_DIR="$WEB_DIR/src/scheme"

log() {
	printf '[promote-ui] %s\n' "$*"
}

fail() {
	printf '[promote-ui] ERROR: %s\n' "$*" >&2
	exit 1
}

usage() {
	cat <<'EOF'
Usage: ./scripts/promote-ui-scheme-to-default.sh <scheme> [--dry-run] [--skip-build]

Promote one experimental UI scheme to web/src/scheme/default.

Arguments:
  <scheme>      One of: a, b, c
  --dry-run     Print the planned actions without modifying files
  --skip-build  Skip the post-copy npm run build:default validation
EOF
}

scheme=${1:-}
shift || true

dry_run=0
skip_build=0

for arg in "$@"; do
	case "$arg" in
		--dry-run)
			dry_run=1
			;;
		--skip-build)
			skip_build=1
			;;
		-h|--help)
			usage
			exit 0
			;;
		*)
			fail "unsupported argument: $arg"
			;;
	esac
done

case "$scheme" in
	a|b|c)
		;;
	''|-h|--help)
		usage
		exit 1
		;;
	*)
		fail "unsupported scheme: $scheme (expected: a, b, or c)"
		;;
esac

source_dir="$SCHEME_DIR/$scheme"
target_dir="$SCHEME_DIR/default"
source_label=$(printf '%s' "$scheme" | tr '[:lower:]' '[:upper:]')

[[ -d "$source_dir" ]] || fail "source scheme directory not found: $source_dir"
[[ -d "$target_dir" ]] || fail "default scheme directory not found: $target_dir"

log "source: $source_dir"
log "target: $target_dir"

if [[ "$dry_run" == "1" ]]; then
	log "dry run: would replace default scheme files with a copy of UI-$source_label"
	log "dry run: would rewrite default/index.ts metadata"
	if [[ "$skip_build" == "0" ]]; then
		log "dry run: would run npm run build:default"
	fi
	exit 0
fi

find "$target_dir" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
cp -a "$source_dir"/. "$target_dir"/

cat >"$target_dir/index.ts" <<EOF
import type { UISchemeDefinition } from "../../lib/composition";

export const defaultUIScheme: UISchemeDefinition = {
	id: "default",
	label: "UI Default",
	description: "默认 UI（由 UI ${source_label} 拷贝冻结，作为当前默认入口）。",
	primaryBlockingFeedbackPlacement: "stage-local",
};
EOF

log "default scheme now mirrors UI-$source_label"

if [[ "$skip_build" == "0" ]]; then
	log "running npm run build:default"
	(
		cd "$WEB_DIR"
		npm run build:default
	)
fi

log "promotion complete"