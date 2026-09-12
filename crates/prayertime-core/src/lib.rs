//! Deterministic prayer-time calculations. No I/O or implicit current date/location.
#![forbid(unsafe_code)]
pub mod astronomy;
pub mod civil;
pub mod model;
pub mod profiles;
pub mod rules;
pub mod windows;
pub use model::*;

use astronomy::{Direction, Event, Latitude, Longitude};
use rules::Rule;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;

pub fn validate_configuration(request: &Request) -> Result<()> {
    civil::date(&request.date)?;
    Latitude::new(request.location.latitude_deg)?;
    Longitude::new(request.location.longitude_deg)?;
    civil::timezone(&request.timezone)?;
    let p = profiles::list_profiles();
    let m = p
        .methods
        .iter()
        .find(|m| m.id == request.profiles.calculation)
        .ok_or_else(|| Error::new("UNKNOWN_CALCULATION_PROFILE", &request.profiles.calculation))?;
    if !p.fiqh.iter().any(|f| f.id == request.profiles.fiqh) {
        return Err(Error::new("UNKNOWN_FIQH_PROFILE", &request.profiles.fiqh));
    }
    if m.ramadan_minutes.is_some() && request.ramadan.is_none() {
        return Err(Error::new(
            "RAMADAN_CONTEXT_REQUIRED",
            "This method needs an explicit Ramadan yes/no selection; no calendar is inferred",
        ));
    }
    for (name, minutes) in &request.adjustments_minutes {
        if !["fajr", "dhuhr", "asr", "maghrib", "isha"].contains(&name.as_str()) {
            return Err(Error::new("INVALID_ADJUSTMENT_TARGET", name));
        }
        if !minutes.is_finite() || minutes.abs() > 120.0 {
            return Err(Error::new(
                "INVALID_ADJUSTMENT",
                "Adjustments must be finite and within -120 to +120 minutes",
            ));
        }
    }
    Ok(())
}
pub fn calculate_solar_events(request: &Request) -> Result<BTreeMap<String, Event>> {
    let date = civil::date(&request.date)?;
    let lat = Latitude::new(request.location.latitude_deg)?;
    let lon = Longitude::new(request.location.longitude_deg)?;
    let tz = civil::timezone(&request.timezone)?;
    let midnight = civil::solar_midnight(date, &tz, lon)?;
    Ok(solar_events(midnight, lat, lon))
}
fn solar_events(midnight: f64, lat: Latitude, lon: Longitude) -> BTreeMap<String, Event> {
    BTreeMap::from([
        (
            "sunrise".into(),
            astronomy::crossing(
                midnight,
                lat,
                lon,
                astronomy::HORIZON_DEG,
                Direction::Morning,
            ),
        ),
        ("solar_transit".into(), astronomy::transit(midnight, lon)),
        (
            "sunset".into(),
            astronomy::crossing(
                midnight,
                lat,
                lon,
                astronomy::HORIZON_DEG,
                Direction::Evening,
            ),
        ),
    ])
}
/// Missing-event estimation only: no capping of an existing astronomical event.
fn fallback(
    request: &Request,
    name: &str,
    angle: f64,
    primary: &Event,
    night: (Option<f64>, Option<f64>),
) -> Option<(f64, Fallback)> {
    let reason = primary.reason()?;
    if reason == "SOLVER_DID_NOT_CONVERGE" {
        return None;
    }
    let fraction = match request.high_latitude {
        HighLatitude::None => return None,
        HighLatitude::MiddleOfNight => 0.5,
        HighLatitude::OneSeventh => 1.0 / 7.0,
        HighLatitude::AngleBased => angle / 60.0,
    };
    let (s, r) = (night.0?, night.1?);
    if r <= s || r - s > 86400.0 {
        return None;
    }
    let t = if name == "fajr" {
        r - fraction * (r - s)
    } else {
        s + fraction * (r - s)
    };
    Some((
        t,
        Fallback {
            strategy: request.high_latitude,
            trigger: "requested_event_absent".into(),
            primary_failure: reason,
            sunset_unix: s,
            sunrise_unix: r,
            fraction,
        },
    ))
}
pub fn calculate_day(request: &Request) -> Result<DayResult> {
    let mut day = calculate_day_without_windows(request)?;
    if request.window_profile != windows::WindowProfile::None {
        day.windows = Some(windows::calculate(&day)?);
    }
    Ok(day)
}
fn calculate_day_without_windows(request: &Request) -> Result<DayResult> {
    validate_configuration(request)?;
    let date = civil::date(&request.date)?;
    let tz = civil::timezone(&request.timezone)?;
    let lat = Latitude::new(request.location.latitude_deg)?;
    let lon = Longitude::new(request.location.longitude_deg)?;
    let midnight = civil::solar_midnight(date, &tz, lon)?;
    let solar = solar_events(midnight, lat, lon);
    let previous_sunset = astronomy::crossing(
        midnight - 86400.0,
        lat,
        lon,
        astronomy::HORIZON_DEG,
        Direction::Evening,
    )
    .instant();
    let next_sunrise = astronomy::crossing(
        midnight + 86400.0,
        lat,
        lon,
        astronomy::HORIZON_DEG,
        Direction::Morning,
    )
    .instant();
    let sunrise = solar["sunrise"].instant();
    let sunset = solar["sunset"].instant();
    let package = profiles::list_profiles();
    let method = package
        .methods
        .iter()
        .find(|m| m.id == request.profiles.calculation)
        .unwrap();
    let fiqh = package
        .fiqh
        .iter()
        .find(|f| f.id == request.profiles.fiqh)
        .unwrap();
    let isha = match method.isha_angle {
        Some(angle_deg) => Rule::SolarDepression {
            angle_deg,
            direction: Direction::Evening,
        },
        None => Rule::FixedInterval {
            base: "sunset".into(),
            minutes: if request.ramadan == Some(true) {
                method
                    .ramadan_minutes
                    .unwrap_or_else(|| method.isha_minutes.unwrap())
            } else {
                method.isha_minutes.unwrap()
            },
        },
    };
    let plan = [
        (
            "fajr",
            "true_dawn_angle_proxy",
            Rule::SolarDepression {
                angle_deg: method.fajr_angle,
                direction: Direction::Morning,
            },
        ),
        (
            "dhuhr",
            "solar_transit_boundary",
            Rule::AtEvent {
                event: "solar_transit".into(),
            },
        ),
        (
            "asr",
            "afternoon_shadow_multiple",
            Rule::ShadowFactor {
                factor: fiqh.asr_factor,
            },
        ),
        (
            "maghrib",
            "standard_apparent_sunset",
            Rule::AtEvent {
                event: "sunset".into(),
            },
        ),
        ("isha", "method_twilight_convention", isha),
    ];
    let mut warnings=vec!["Draft profiles: provider-attributed conventions; not authority-verified.".into(),"Fiqh selection currently determines Asr only. The optional Shafi‘i window profile is separate; full school variants are not implemented.".into(),"Standard -0.833° horizon; no terrain, elevation or weather model. Dhuhr uses transit without an automatic precautionary delay.".into()];
    let mut prayers = Vec::new();
    for (name, criterion, rule) in plan {
        let primary = rules::evaluate(&rule, midnight, lat, lon);
        let estimate = if let Rule::SolarDepression { angle_deg, .. } = rule {
            fallback(
                request,
                name,
                angle_deg,
                &primary,
                if name == "fajr" {
                    (previous_sunset, sunrise)
                } else {
                    (sunset, next_sunrise)
                },
            )
        } else {
            None
        };
        let raw = primary.instant().or_else(|| estimate.as_ref().map(|x| x.0));
        let basis = if estimate.is_some() {
            "estimated"
        } else if raw.is_none() {
            "unavailable"
        } else if matches!(rule, Rule::FixedInterval { .. }) {
            "derived"
        } else {
            "astronomical"
        };
        let minutes = request
            .adjustments_minutes
            .get(name)
            .copied()
            .unwrap_or(0.0);
        let adjusted = raw.map(|t| t + minutes * 60.0);
        let mut history = Vec::new();
        if let Some(t) = raw {
            if minutes != 0.0 {
                history.push(Adjustment {
                    category: "user_timetable".into(),
                    minutes,
                    before_unix: t,
                    after_unix: t + minutes * 60.0,
                });
            }
        }
        let unavailable_reason = if raw.is_none() {
            if request.high_latitude != HighLatitude::None
                && matches!(rule, Rule::SolarDepression { .. })
                && (sunrise.is_none()
                    || sunset.is_none()
                    || (name == "fajr" && previous_sunset.is_none())
                    || (name == "isha" && next_sunrise.is_none()))
            {
                Some("REFERENCE_NIGHT_UNAVAILABLE".into())
            } else {
                primary.reason()
            }
        } else {
            None
        };
        if basis == "estimated" {
            warnings.push(format!("{name} is estimated from a night fraction because its requested solar event is absent."));
        }
        prayers.push(PrayerResult {
            name: name.into(),
            status: basis.into(),
            criterion: criterion.into(),
            rule,
            primary,
            raw: raw.map(|t| civil::render(t, date, &tz)).transpose()?,
            adjusted: adjusted.map(|t| civil::render(t, date, &tz)).transpose()?,
            displayed: adjusted
                .map(|t| civil::render(civil::round_local(t, request.rounding, &tz)?, date, &tz))
                .transpose()?,
            unavailable_reason,
            fallback: estimate.map(|x| x.1),
            adjustments: history,
        });
    }
    // Tuned timetable warnings never rewrite raw calculation boundaries.
    let times: Vec<_> = prayers
        .iter()
        .map(|p| p.adjusted.as_ref().map(|i| i.unix_seconds))
        .collect();
    if times
        .windows(2)
        .any(|p| matches!((p[0],p[1]),(Some(a),Some(b)) if a>=b))
    {
        warnings.push(
            "Adjusted timetable is not strictly ordered. Review offsets and profiles.".into(),
        );
    }
    if matches!((times[0],sunrise),(Some(f),Some(r)) if f>=r) {
        warnings.push("Adjusted Fajr is at or after sunrise.".into());
    }
    if matches!((times[2],sunset),(Some(a),Some(s)) if a>=s) {
        warnings.push("Adjusted Asr is at or after sunset.".into());
    }
    let solar_local = solar
        .iter()
        .map(|(name, e)| {
            Ok((
                name.clone(),
                e.instant()
                    .map(|t| {
                        civil::render(civil::round_local(t, request.rounding, &tz)?, date, &tz)
                    })
                    .transpose()?,
            ))
        })
        .collect::<Result<BTreeMap<_, _>>>()?;
    let midpoint = match (sunset, next_sunrise) {
        (Some(s), Some(r)) if r > s => Some(civil::render((s + r) / 2.0, date, &tz)?),
        _ => None,
    };
    // Normalize semantically irrelevant explicit zero offsets and signed zeros.
    let mut normalized = request.clone();
    normalized.adjustments_minutes.retain(|_, v| *v != 0.0);
    if normalized.location.latitude_deg == 0.0 {
        normalized.location.latitude_deg = 0.0;
    }
    if normalized.location.longitude_deg == 0.0 {
        normalized.location.longitude_deg = 0.0;
    }
    if method.ramadan_minutes.is_none() {
        normalized.ramadan = None;
    }
    let canonical=serde_json::to_vec(&serde_json::json!({"encoding":"prayertime-fingerprint-v1","request":normalized,"engine":env!("CARGO_PKG_VERSION"),"astronomy":astronomy::MODEL,"tzdb":civil::tzdb_version(),"profiles":package,"window_definition":windows::DEFINITION})).map_err(|e|Error::new("SERIALIZATION_ERROR",e.to_string()))?;
    let fingerprint = format!("sha256:{:x}", Sha256::digest(canonical));
    Ok(DayResult {
        schema_version: "0.2.0".into(),
        engine_version: env!("CARGO_PKG_VERSION").into(),
        astronomy_model: astronomy::MODEL.into(),
        timezone_database: civil::tzdb_version(),
        profile_package: package.package_version,
        fingerprint,
        request: request.clone(),
        prayers,
        solar,
        solar_local,
        solar_night_midpoint: midpoint,
        windows: None,
        warnings,
    })
}
pub fn calculate_range(request: &Request, days: usize) -> Result<Vec<DayResult>> {
    if !(1..=366).contains(&days) {
        return Err(Error::new(
            "INVALID_RANGE",
            "Range must contain 1 to 366 days",
        ));
    }
    let date = civil::date(&request.date)?;
    let mut result = Vec::with_capacity(days);
    for d in 0..days {
        let mut r = request.clone();
        r.date = civil::shifted(date, d as i64)?.to_string();
        result.push(calculate_day(&r)?);
    }
    Ok(result)
}
pub fn parse_request(json: &str) -> Result<Request> {
    serde_json::from_str(json).map_err(|e| Error::new("INVALID_REQUEST", e.to_string()))
}
