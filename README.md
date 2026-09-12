# PrayerTime 0.1

A working **development alpha** of the app described in `doc/doc-eng/`. One Rust engine powers the native CLI and the browser through WebAssembly. Calculations and bundled IANA timezone data work without an application server.

## Open the app

The production app has already been built in `dist/`:

```bash
./scripts/start.sh
```

Open **http://localhost:8080**. Search for a city and select a result, or choose **Use my location**. Both fill the coordinates and timezone automatically. Then select the method and Asr convention; valid changes recalculate automatically after a brief typing delay. The default location is Berlin; it is an editable example, not a detected location. Manual coordinates and timezone overrides are available under **Coordinates & timezone override**.

The browser provides daily and monthly timetables, missing/estimated statuses, calculation explanations, JSON/CSV exports, saved settings, optional geolocation, and an offline service worker. Browser geolocation needs localhost or HTTPS. The date defaults to today in the selected saved timezone; the calculation core never reads the clock.

Offline assets install on the production build's first successful load. The header reports “Ready offline” after the worker confirms installation. Browser UI/offline reload testing remains to be completed; the automated suite verifies offline asset caching and network-free WASM calculations.

City searches go to [Open-Meteo](https://open-meteo.com/en/docs/geocoding-api) with [GeoNames](https://www.geonames.org/) attribution; the service returns each city's IANA timezone. New city searches need internet, while starter cities and your 20 most recently selected places remain available offline. The free endpoint is for noncommercial use and is subject to [Open-Meteo's usage limits and terms](https://open-meteo.com/en/terms).

GPS and manual coordinate detection use bundled [tzf-wasm](https://github.com/ringsaturn/tzf-wasm) timezone boundaries on your device; the app does not send these coordinates to the city-search service. This adds about 9 MB of uncompressed offline assets. The boundary data is simplified to roughly 111-metre precision; check the visible zone near a boundary and use the override when needed. The Rust engine applies date-specific timezone rules and daylight saving time. GPS still depends on device support and permission. When a new version is ready, use Update now after closing other PrayerTime tabs or app windows. Initial upgrades from versions without this button require closing all app tabs once.

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

Profiles are draft, provider-attributed representations of the paper. They are **not independently authority-verified**. Full multi-school prayer windows, observed shafaq semantics, shared Ja‘fari intervals, polar reference schedules, terrain/weather corrections, notifications, mobile bindings and REST hosting are not implemented in this alpha. See [the review and implementation map](docs/implementation-review.md).

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

The month table shows each Gregorian date with its Umm al-Qura Hijri equivalent, including in CSV exports. The header theme selector supports System, Light and Dark; your preference is stored separately from calculation settings. Green (`#076849`) and gold (`#dfaf2b`) accent actions and navigation while reading surfaces use neutral theme colors. Theme checks exercise pre-paint selection, unavailable storage and text contrast in both palettes.

Prayer explanations also include a sourced Sunni fiqh overview. This educational text distinguishes start signs and selected school differences; it does not implement complete legal windows, change the numerical engine or infer an Isha criterion from the Asr selector.

## Languages and automatic updates

Choose English, Deutsch or العربية in the header. The preference is saved on this device. Arabic uses right-to-left layout; Gregorian and Hijri dates use the selected locale. Labels, messages, method names, calculation explanations and fiqh overviews have bundled German and Arabic translations and remain available offline. Raw JSON, calculation identifiers, timezone IDs and input values retain their canonical form. City searches ask the provider for the selected language.

Completed configuration edits automatically recalculate after a 300 ms typing delay. Incomplete fields retain the last result; validation messages explain rejected inputs. Changing configuration invalidates earlier calculations and monthly results so they cannot overwrite a newer request. The Recalculate button remains available for retrying.


### Prayer windows (M4)

In **Calculation → Prayer-window profile**, choose a named draft account, then open **Windows**. There are six options:

- Shafi‘i
- Hanafi: Abu Hanifa / white twilight
- Hanafi: Sahibayn / red twilight
- Maliki: Risalah commentary
- Hanbali: Umdat al-Fiqh / half-night
- Hanbali: two shadows / first third

The selector is independent of the timetable Asr convention. Each profile includes sources and its own preferred, ordinary, disliked-delay and necessity boundaries. Necessity is explicitly conditional. Source disagreements are exposed as named accounts rather than silently combined into a universal school rule. These remain research drafts, not reviewed religious determinations.

The CLI/WASM request accepts `window_profile`: `shafii_draft`, `hanafi_abu_hanifa_draft`, `hanafi_sahibayn_draft`, `maliki_risala_draft`, `hanbali_umdat_draft` or `hanbali_third_draft`. Omitted or `none` disables windows. Result schema and engine are 0.3.0. Old saved Shafi‘i selections continue to work.

All calculated boundaries retain raw and displayed instants. Fractions use raw sunset to the next civil date’s dawn, including DST changes. User timetable offsets never move window boundaries. Unknown brightness, white-twilight mapping, yellowing, star visibility and prayer durations remain explicitly unavailable; no angle or duration is invented. In particular, the reserved final intervals in the Maliki account are not replaced by unrestricted sunset/dawn deadlines. Fixed-minute Isha does not resolve red twilight. Null optional fields mean unspecified.

Sources are embedded in the `profiles/windows-*.json` files and linked in the app. German/Arabic text and offline calculation cover all six accounts. Full shared-time validity rules, personal-excuse adjudication and Ja‘fari profiles remain future work.


## Phone installation and public hosting

The production app includes 192/512 px icons, a maskable Android icon, an Apple touch icon, standalone metadata, and an Install PrayerTime button with English, German and Arabic instructions. Android browsers can show their native install prompt; iPhone users can use Safari → Share → Add to Home Screen. Wait for Ready offline before disconnecting. Settings remain on the device; new city searches require internet.

Updates wait for an explicit Update now action. Activation is blocked while other app windows are open, and the button is disabled while configuration changes or calculations are pending. Automated tests cover worker caching and update lifecycle; physical Android/iPhone installation, airplane-mode relaunch, and settings persistence still require device testing.

The existing Sites deployment supports public access and a custom domain. Connect a domain only after obtaining its actual hostname and configuring the DNS records supplied by the host. Changing origins does not migrate installed apps or local settings: choose the permanent domain before asking users to install broadly.

### Deploy to Cloudflare Pages

Live website: **https://prayertime-3cl.pages.dev/**

Run these commands in your local terminal, not in the Cloudflare dashboard. Use Node.js 22.13 or newer.

1. Install dependencies and build from the repository root:

```sh
cd ~/projects/prayertime
npm ci --prefix apps/web
npm --prefix apps/web run build
```

2. Log in to Cloudflare. Complete the authorization in the browser that opens:

```sh
cd apps/web
npx wrangler login
```

3. For a new setup only, create the Pages project and enter `main` when asked for the production branch. The existing `prayertime` project has already been created; skip this step when updating it:

```sh
npx wrangler pages project create prayertime
```

4. From `apps/web`, deploy the built website:

```sh
npx wrangler pages deploy ../../dist --project-name prayertime --branch main
```

The root `dist/` directory contains the static website. Wrangler prints a URL for each deployment; use **https://prayertime-3cl.pages.dev/** as the stable production address for this project.

For later updates, rebuild and deploy:

```sh
cd ~/projects/prayertime
npm --prefix apps/web run build
cd apps/web
npx wrangler pages deploy ../../dist --project-name prayertime --branch main
```

Run `npm ci --prefix apps/web` from the repository root before building if dependencies have changed. The repository contains the built prayer-engine WASM, so this frontend build does not require Rust. Rebuild WASM with the project scripts whenever the Rust core changes. No server, database or API secrets are required for hosting this build.

### Install on a phone

1. Open https://prayertime-3cl.pages.dev/ on your phone.
2. On Android, tap **Install PrayerTime** and follow the prompts. On iPhone, open the site in **Safari → Share → Add to Home Screen → Add**.
3. Wait for **Ready offline**, then open the installed app in airplane mode to check offline access. New city searches still require internet.

The user confirmed that the deployed site opens correctly. Separate Android/iPhone installation and offline persistence checks remain to be completed.

To connect a domain you own, open **Cloudflare → Workers & Pages → prayertime → Custom domains → Set up a domain** and follow the DNS instructions. Install from your final domain: settings and installations from another address do not transfer automatically.

Run `node scripts/prepare-icons.mjs` after changing the SVG icon (requires the web dependencies). Run `scripts/check.sh` for the complete validation suite. Native home-screen widgets remain a separate Android/iOS development stage.
