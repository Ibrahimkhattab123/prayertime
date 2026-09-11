# PrayerTime 0.1

A working **development alpha** of the app described in `doc/doc-eng/`. One Rust engine powers the native CLI and the browser through WebAssembly. Calculations and bundled IANA timezone data work without an application server.

## Open the app

The production app has already been built in `dist/`:

```bash
./scripts/start.sh
```

Open **http://localhost:8080**. Search for a city and select a result, or choose **Use my location**. Both fill the coordinates and timezone automatically. Then select the method and Asr convention and calculate. The default location is Berlin; it is an editable example, not a detected location. Manual coordinates and timezone overrides are available under **Coordinates & timezone override**.

The browser provides daily and monthly timetables, missing/estimated statuses, calculation explanations, JSON/CSV exports, saved settings, optional geolocation, and an offline service worker. Browser geolocation needs localhost or HTTPS. The date defaults to today in the selected saved timezone; the calculation core never reads the clock.

Offline assets install on the production build's first successful load. The header reports “Ready offline” after the worker confirms installation. Browser UI/offline reload testing remains to be completed; the automated suite verifies offline asset caching and network-free WASM calculations.

City searches go to [Open-Meteo](https://open-meteo.com/en/docs/geocoding-api) with [GeoNames](https://www.geonames.org/) attribution; the service returns each city's IANA timezone. New city searches need internet, while starter cities and your 20 most recently selected places remain available offline. The free endpoint is for noncommercial use and is subject to [Open-Meteo's usage limits and terms](https://open-meteo.com/en/terms).

GPS and manual coordinate detection use bundled [tzf-wasm](https://github.com/ringsaturn/tzf-wasm) timezone boundaries on your device; the app does not send these coordinates to the city-search service. This adds about 9 MB of uncompressed offline assets. The boundary data is simplified to roughly 111-metre precision; check the visible zone near a boundary and use the override when needed. The Rust engine applies date-specific timezone rules and daylight saving time. GPS still depends on device support and permission. Close all app tabs and reopen the app to activate an installed update.

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
- 18 draft method presets: MWL, ISNA, Karachi, Umm al-Qura style, Egypt, Gulf, Kuwait, Qatar, Singapore, France, Turkey, Russia, Dubai, Malaysia/JAKIM, Tunisia, Algeria, Indonesia/KEMENAG and Morocco. Umm al-Qura style requires explicit Ramadan context (90/120 minutes from raw sunset); Gulf and Qatar always use 90 minutes. These are angle/interval presets, not replicas of each authority’s complete timetable.
- Asr factors: Shafi‘i/Maliki/Hanbali, Hanafi Abu Hanifa, Hanafi Sahibayn. These are **Asr-only profiles**, not complete fiqh implementations.
- Missing-event-only middle-night, one-seventh and angle-portion estimates. Fajr uses the previous sunset/current sunrise; Isha uses current sunset/next sunrise. Missing polar reference nights remain unavailable.
- Absolute UTC instants, embedded IANA tzdb, per-event offsets and final rounding; reproducible SHA-256 configuration fingerprints.
- Dates 1900–2100; ranges of 1–366 days. A range has one explicit Ramadan context for every included day.

Profiles are draft, provider-attributed representations of the paper. They are **not independently authority-verified**. Legal prayer windows, full shafaq semantics, shared Ja‘fari intervals, polar reference schedules, terrain/weather corrections, notifications, mobile bindings and REST hosting are not implemented in this alpha. See [the review and implementation map](docs/implementation-review.md).

## Validation

```bash
./scripts/check.sh
```

The suite includes US Naval Observatory snapshots (16 independent reference records), seasonal inverse-altitude regressions, global ordering, method/Asr independence, fixed-Isha adjustment isolation, actual adjacent-night fallback, DST/date-line cases, invalid inputs, rounding/fingerprints and a full year at Berlin, Stockholm and Tromsø. Native/WASM parity exercises all five bindings with 32 detailed request comparisons. Location tests cover ambiguous cities, saved places, failed searches, retries and seven real coordinate-to-timezone lookups followed by Rust calculations with networking disabled. The service-worker test runs generated production code against an offline cache harness, including the timezone boundary assets.

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

## Explanations and Hijri date

Each prayer explanation describes its actual criterion, solar-position and hour-angle equations, recorded solver values, estimation (when used), timezone conversion, offsets and rounding. It reads the calculated result so changing unfinished settings does not rewrite the explanation of the previous timetable.

The Hijri date beneath the Gregorian heading uses the browser’s explicit `islamic-umalqura` calendar for the selected civil date. It is a calendar equivalent, not a live sunset rollover or confirmation of local moon sighting; it never supplies the engine’s Ramadan context. Unsupported calendars show “Hijri date unavailable”.

The 14 added regional presets are checked against the dated provider snapshot in [method-sources.json](profiles/method-sources.json). Specialized Moonsighting models, Tehran/Qom twilight-based Maghrib and legal-window semantics, and Lisbon/Jordan method-specific delays remain outside this preset set. No substitute method is silently used for them.
