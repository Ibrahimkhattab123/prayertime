# PrayerTime 0.1

A working **development alpha** of the app described in `doc/doc-eng/`. One Rust engine powers the native CLI and the browser through WebAssembly. Calculations and bundled IANA timezone data work without an application server.

## Open the app

The production app has already been built in `dist/`:

```bash
./scripts/start.sh
```

Open **http://localhost:8080**. Choose a city or enter coordinates and an IANA timezone, select the method and Asr convention, and calculate. The default location is Berlin; it is an editable example, not a detected location.

The browser provides daily and monthly timetables, missing/estimated statuses, calculation explanations, JSON/CSV exports, saved settings, optional geolocation, and an offline service worker. Browser geolocation needs localhost or HTTPS. The date defaults to today in the selected saved timezone; the calculation core never reads the clock.

Offline assets install on the production build's first successful load. The header reports “Ready offline” after the worker confirms installation. Browser UI/offline reload testing remains to be completed; the automated suite verifies offline asset caching and network-free WASM calculations.

## Native CLI

```bash
source "$HOME/.cargo/env"
cargo run -p prayertime-cli -- calculate-day --request examples/berlin.json
cargo run -p prayertime-cli -- solar --date 2026-09-09 --latitude 52.52 --longitude 13.405 --timezone Europe/Berlin
cargo run -p prayertime-cli -- calculate-range --request examples/berlin.json --days 30
cargo run -p prayertime-cli -- list-profiles
cargo run -p prayertime-cli -- compare-methods --request examples/berlin.json
cargo run -p prayertime-cli -- compare-fiqh --request examples/berlin.json
cargo run -p prayertime-cli -- compare-highlat --request examples/berlin.json
cargo run -p prayertime-cli -- explain --request examples/berlin.json
cargo run -p prayertime-cli -- validate --request examples/berlin.json
```

CLI flag defaults are a fixed Berlin example for **2026-09-09**; supply `--date` or a JSON request for another day. `compare-methods` reports a per-method error for Umm al-Qura when Ramadan context has not been supplied. Use `--ramadan false` or `--ramadan true` with flag-based requests, or set the JSON field.

## Build from source

Requires Rust/Cargo, Node.js 22.13+ and npm. The lockfiles are committed. This workspace was verified with Rust 1.98.1 and Node 22.23.2.

```bash
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.128 --locked
npm --prefix apps/web ci
./scripts/build-wasm.sh
npm --prefix apps/web run build
./scripts/start.sh
```

The `wasm-bindgen` CLI must match the version in `Cargo.lock`. Generated web bindings are included in `apps/web/public/wasm/`, so frontend-only changes do not require rebuilding Rust. Rebuild WASM after any core/profile change.

For frontend development:

```bash
npm --prefix apps/web run dev
```

Development builds do not register the offline worker. The static production output is `dist/`; any ordinary static server can serve it. No secrets, accounts, paid API, database or external prayer-times service are required.

## Supported scope

- Chapter 11 approximate solar model with iteration and a bounded search around seasonal transition cases.
- Standard −0.833° horizon; sunrise, transit and sunset independent of religious settings.
- Fajr, transit-based Dhuhr, shadow-factor Asr, sunset-based Maghrib, angle/fixed-interval Isha.
- MWL, ISNA, Karachi, and Umm al-Qura-style draft methods. The last requires explicit Ramadan context (90/120 minutes from raw sunset).
- Asr factors: Shafi‘i, Hanafi Abu Hanifa, Hanafi Sahibayn. These are **Asr-only profiles**, not complete fiqh implementations.
- Missing-event-only middle-night, one-seventh and angle-portion estimates. Fajr uses the previous sunset/current sunrise; Isha uses current sunset/next sunrise. Missing polar reference nights remain unavailable.
- Absolute UTC instants, embedded IANA tzdb, per-event offsets and final rounding; reproducible SHA-256 configuration fingerprints.
- Dates 1900–2100; ranges of 1–366 days. A range has one explicit Ramadan context for every included day.

Profiles are draft, provider-attributed representations of the paper. They are **not independently authority-verified**. Legal prayer windows, full shafaq semantics, shared Ja‘fari intervals, polar reference schedules, terrain/weather corrections, notifications, mobile bindings and REST hosting are not implemented in this alpha. See [the review and implementation map](docs/implementation-review.md).

## Validation

```bash
./scripts/check.sh
```

The suite includes US Naval Observatory snapshots (16 independent reference records), seasonal inverse-altitude regressions, global ordering, method/Asr independence, fixed-Isha adjustment isolation, actual adjacent-night fallback, DST/date-line cases, invalid inputs, rounding/fingerprints and a full year at Berlin, Stockholm and Tromsø. Native/WASM parity exercises all five bindings with 16 detailed request comparisons. The service-worker test runs generated production code against an offline cache harness.

This evidence supports a development alpha. It does not constitute certification of the entire 39-chapter specification or observational/religious validation. No browser was available for interactive, visual, PWA-installation or actual offline-reload testing.

## Structure

```text
crates/prayertime-core/   pure astronomy, civil time, rules, profiles, orchestration
crates/prayertime-cli/    native JSON interface
crates/prayertime-wasm/   thin wasm-bindgen JSON interface
profiles/                versioned embedded draft package
apps/web/                React/TypeScript UI (Vite/Vinext static export)
scripts/                 build, start, parity and offline checks
docs/                    review, supported requirements and limitations
doc/doc-eng/             original theory and specification, preserved
```
