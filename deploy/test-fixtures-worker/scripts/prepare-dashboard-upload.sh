#!/usr/bin/env bash
# Pack only files needed for Cloudflare dashboard upload (no node_modules).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/dist/dashboard-upload}"

rm -rf "$OUT"
mkdir -p "$OUT"
cp -r "$ROOT/public" "$OUT/"
cp -r "$ROOT/src" "$OUT/"
cp "$ROOT/wrangler.toml" "$OUT/"

count="$(find "$OUT" -type f | wc -l)"
size="$(du -sh "$OUT" | cut -f1)"
echo "Ready: $OUT"
echo "  files: $count (well under the 1000 dashboard limit)"
echo "  size:  $size"
echo ""
echo "Upload ONLY this folder in the Cloudflare dashboard, not the parent test-fixtures-worker directory."
