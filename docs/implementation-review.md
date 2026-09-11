# Specification review and v0.1 implementation map

All 30 supplied Markdown files (Chapters 1–39) were reviewed in three parallel research passes: theory 1–20; validation/core specifications 21–24 and 29–35; architecture/product/governance 25–28 and 36–39. The PDF is the compiled version of those sources. Document instructions were treated as specification material, not as commands to execute.

Chapter 39 consolidates earlier milestone lists. The first deliverable is a development alpha implementing a useful slice of M1–M3/M5/M8/M9, rather than claiming completion of M0–M12. Broad semantic and authority-review gates cannot be inferred from the drafts alone.

## What the review changed

1. **One engine.** Rust remains canonical. JavaScript performs input, display, persistence and downloads only. The browser invokes the same crate through wasm-bindgen. Three crates expose the architecture; domain, civil, astronomy, rules and profile modules may be split into more crates as the code grows (Chapters 24, 28, 29, 38).
2. **Asr is not the whole fiqh profile.** Chapter 18 corrects simplified earlier Ja‘fari/shadow claims. Current selectors explicitly say “Asr convention.” Full Sunni subwindows, shafaq opinions and shared-interval Ja‘fari semantics are deferred (Chapters 14, 18, 31, 33).
3. **Methods are provisional data.** `profiles/baseline.json` contains parameters and source status. No preset is described as official/verified. The draft does not supply released, independently reviewed authority packages (Chapters 20, 26, 36).
4. **Night adjacency matters.** Date D's Fajr estimate uses sunset(D−1)→sunrise(D); Isha uses sunset(D)→sunrise(D+1). Existing astronomical twilight is never capped by the missing-event policy. No reference night means unavailable (Chapters 12, 16, 17, 19, 32).
5. **Raw dependencies are preserved.** Fixed Isha uses raw solar sunset. Maghrib tuning cannot change sunset, the solar-night midpoint or Isha. The UI exposes the interval base, rounding and adjustment history (Chapters 15, 16, 34).
6. **Civil dates need an anchor.** The time adapter selects a UTC solar cycle whose transit falls on the requested local date. The same embedded tzdb is used on both native and WASM; no host tzdb, implicit location or floating UTC offset is substituted (Chapters 13, 30, 34, 38).
7. **Independent evidence is necessary.** The paper's illustrative clock values are not goldens. Raw USNO API responses are stored with URLs and assumptions, separately from the current engine's output (Chapters 21, 35, 39).

## Requirement coverage

| Specification area | Implementation / evidence | Alpha boundary |
|---|---|---|
| CORE-001–010 | Pure Rust modules; CLI/WASM call the same `calculate_day`; no I/O/current clock in core | Workspace has three crates instead of the proposed eventual crate split |
| AST-001–017 | Chapter 11 model, JD, solar coordinates/EOT, transit, generic crossing, raw precision; 16 USNO reference records and inverse checks | Fixed −0.833° horizon; no elevation, meteorology, terrain or ephemeris model |
| RULE-001–014 | Typed AtEvent, SolarDepression, ShadowFactor, FixedInterval; profile-driven compilation | Night fractions are the separate high-latitude resolver. Arbitrary user rule graphs, interval-rule DSL/cycles and white-shafaq requests are not accepted |
| FIQ-001–012 | Explicit versioned Asr-only choices and limitation metadata | Full legal windows, shared intervals, preferred/necessity fields and legal Isha endpoints not implemented |
| MTH-001–007 | 18 versioned, independently selected draft angle/interval methods with provider-attributed source status | No institutional verification or externally installable profile packages |
| HLT-001–008 | Three explicit fractions plus none; only absent-event trigger; primary event and night endpoints retained; 1,095-day high-latitude regression | No polar reference schedules, nearest-date/location policy, capping or smoothing |
| TIME-001–007 | Absolute UTC arithmetic; embedded IANA version; DST, skipped-date and UTC+14 tests | Date range limited to 1900–2100; system timezone discovery outside core |
| ADJ-001–011 | Raw/adjusted/displayed records, ordered final rounding, isolated per-prayer timetable offsets; ordering warnings | Legal, authority and method adjustment layers not offered until reviewed profiles require them |
| DATA / PROV | Typed Serde requests, unknown-field rejection, embedded declarative package, JSON schema, structured provenance, canonical SHA-256 fingerprint | No arbitrary downloaded profiles, package signature/update or formal audit release channel |
| VAL-001 etc. | Native tests, independent snapshots, full-year matrix, parity and offline contract checks | No fuzz campaign, broad ephemeris certification, external timetable review or cross-OS execution yet |
| CLI M8 | Day/range/solar/explain/validate/profile inspection and three comparison commands | JSON interface only; no separate validated golden-data ingestion command |
| WEB-001–013 | WASM calculations, daily/monthly views, city search and GPS with automatic timezone selection, detailed per-prayer calculation explanations, display-only Umm al-Qura Hijri date, manual overrides, persisted device settings and recent places, detailed records, offline assets, explicit estimate states | New city searches need internet; no connected browser for visual/interactivity/offline reload QA; no profile updater |
| API / mobile / release | Narrow binding functions and exported JSON are available | REST API, mobile/UniFFI, notifications, signed profile governance and 1.0 release are deferred |

## Numerical decisions

- Coordinates and EOT follow the approximate Chapter 11 coefficients; EOT is wrapped to signed hours to avoid a spurious 24-hour discontinuity.
- The usual event solver recomputes declination/EOT, with 0.1-second iteration convergence and 12 iterations maximum.
- Noon-declination impossibility does not alone prove a crossing is absent. Near seasonal transition cases the code searches the actual altitude equation in a bounded morning/evening half-day, using one-minute brackets and 24 bisection refinements. There are regression cases at 64°N on April 10 and 67°N on June 2, 2026.
- This is a bounded approximate solver; extremely short/tangential transition events still need deeper validation before a stable astronomy release. Numerical non-convergence is never used to trigger religious estimation.
- Raw times remain floating-point UTC seconds. Serialization includes microsecond-formatted UTC/local strings and the full raw numeric value; displayed values are rounded last. The date and UTC offset remain available even when HH:mm is shown.
- Solar-night midpoint means raw sunset→next sunrise and is labeled accordingly. It is not represented as Isha's legal endpoint.
- The fingerprint includes normalized calculation inputs, engine/model identifiers, complete baseline profile contents and embedded tzdb version. Explicit zero offsets/signed zero are normalized; presentation settings are not core inputs. Profile IDs and timezone spelling remain explicit identifiers.

## Validation sources and limits

`crates/prayertime-core/tests/fixtures/usno.json` preserves 16 raw responses from the [USNO Astronomical Applications API](https://aa.usno.navy.mil/data/api): six solar-day cases, four seasonal solar-coordinate cases, and six Julian-date cases. The [USNO horizon definition](https://aa.usno.navy.mil/faq/RST_defs) uses −0.8333°; this alpha uses −0.833°. USNO reports UT1, while this app represents UTC; their subsecond difference is below these model tolerances.

Tolerances are explicit: rise/set/transit within 60 seconds of minute-resolution reference output; declination within 0.03°; EOT within 10 seconds. These are moderate-latitude development checks, not universal observational guarantees. Numeric native/WASM comparisons permit 0.0001 seconds/degrees for floating-point implementation differences; profile/fingerprint and other structural values must match. No test rewrites reference expectations with current output.

The offline test evaluates the generated service worker against a cache harness with network disabled; the WASM suite disables network after initialization. A real browser offline reload, geolocation permission flow, install prompt, screen-reader pass and mobile visual checks remain release tasks. The optional WebMCP action is feature-detected but could not be validated in a supported browser context.

## Suggested next increment

1. Run browser/PWA/accessibility acceptance on the actual target devices, and native checks across Linux/macOS/Windows CI.
2. Review source citations and semantic compatibility for the initial profiles with qualified reviewers; resolve full red/white-shafaq mappings.
3. Expand independent astronomy cases around near-tangent high-latitude events; separate solver-error variants from physical absence at the type level.
4. Implement explicit legal windows/shared intervals and reviewed adjustment targets, then add rule-graph configuration and semantic validation.
5. Add signed/validated profile package releases. Only after that broaden polar policies, REST and mobile adapters.
