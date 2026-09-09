#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
cargo fmt --all -- --check
cargo test --locked --workspace
cargo clippy --locked --workspace --all-targets -- -D warnings
cargo build --locked -p prayertime-cli
scripts/build-wasm.sh
node scripts/test-wasm.mjs
node scripts/test-view-model.mjs
node scripts/prepare-timezone.mjs
node scripts/test-location.mjs
npm --prefix apps/web run typecheck
npm --prefix apps/web run build
node scripts/test-offline.mjs
