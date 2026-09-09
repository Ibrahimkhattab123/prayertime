#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
cargo build --locked --release -p prayertime-wasm --target wasm32-unknown-unknown
wasm-bindgen target/wasm32-unknown-unknown/release/prayertime_wasm.wasm --target web --out-dir apps/web/public/wasm --out-name prayertime
