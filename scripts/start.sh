#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ ! -f dist/index.html ]]; then
  echo 'Build first: ./scripts/build-wasm.sh && npm --prefix apps/web run build' >&2
  exit 1
fi
exec python3 -m http.server "${PRAYERTIME_PORT:-8080}" --bind 127.0.0.1 --directory dist
