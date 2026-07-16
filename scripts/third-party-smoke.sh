#!/usr/bin/env bash
# 对已部署的一体化 Compose 实例跑真实 UI/API 冒烟（Playwright，不 mock）。
# 必填：
#   CHAIN_SUBCONVERTER_E2E_BASE_URL
# 可选覆盖（仅影响 real-smoke；real-full 遇覆盖会 skip 以保住 preview 金样）：
#   CHAIN_SUBCONVERTER_E2E_LANDING_INPUT[,_2,_3...]
#   CHAIN_SUBCONVERTER_E2E_TRANSIT_INPUT[,_2,_3...]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${CHAIN_SUBCONVERTER_E2E_BASE_URL:-}"

if [[ -z "$BASE_URL" ]]; then
	echo "third-party-smoke: CHAIN_SUBCONVERTER_E2E_BASE_URL is required" >&2
	exit 1
fi

export CHAIN_SUBCONVERTER_E2E_BASE_URL="$BASE_URL"
export CHAIN_SUBCONVERTER_E2E_SKIP_WEB_SERVER=1

echo "third-party-smoke: base URL=$BASE_URL"
curl -fsS "${BASE_URL%/}/healthz" | tr -d '\n'
echo

cd "$ROOT/web"
npm run test:e2e:real:smoke
npm run test:e2e:real:full
