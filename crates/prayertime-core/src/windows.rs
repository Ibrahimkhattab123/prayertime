//! Explicit, opt-in draft windows. Timetable offsets never move these boundaries.
use crate::{astronomy, civil, DayResult, Result};
use serde::{Deserialize, Serialize};

pub const DEFINITION: &str = include_str!("../../../profiles/windows-shafii.json");
#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum WindowProfile {
    #[default]
    None,
    ShafiiDraft,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Criterion {
    TrueDawn,
    Sunrise,
    AfterTransit,
    OneShadow,
    Sunset,
    RedTwilightProxy,
    NextTrueDawn,
    FirstThirdOfNight,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WindowDefinition {
    pub prayer: String,
    pub start: Criterion,
    pub absolute_end: Criterion,
    pub preferred_until: Option<Criterion>,
    pub choice_until: Option<Criterion>,
    pub necessity_until: Option<Criterion>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Definition {
    pub id: String,
    pub status: String,
    pub sources: Vec<String>,
    pub windows: Vec<WindowDefinition>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Boundary {
    pub criterion: Criterion,
    pub status: String,
    pub raw: Option<crate::CivilInstant>,
    pub displayed: Option<crate::CivilInstant>,
    pub unavailable_reason: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PrayerWindow {
    pub prayer: String,
    /// available, estimated, incomplete, or invalid_order; never silently reorder.
    pub status: String,
    pub start: Boundary,
    pub absolute_end: Boundary,
    /// None means unspecified, not equivalent to the absolute end.
    pub preferred_until: Option<Boundary>,
    pub choice_until: Option<Boundary>,
    pub necessity_until: Option<Boundary>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WindowSchedule {
    pub definition: Definition,
    pub windows: Vec<PrayerWindow>,
}

pub fn calculate(day: &DayResult) -> Result<WindowSchedule> {
    let request = &day.request;
    let date = civil::date(&request.date)?;
    let tz = civil::timezone(&request.timezone)?;
    let lat = astronomy::Latitude::new(request.location.latitude_deg)?;
    let lon = astronomy::Longitude::new(request.location.longitude_deg)?;
    let midnight = civil::solar_midnight(date, &tz, lon)?;
    let asr = astronomy::shadow(midnight, lat, lon, 1.0);
    // Calculate the next civil day, not a local clock plus 24 hours (DST).
    let next = civil::shifted(date, 1).and_then(|d| {
        let mut r = request.clone();
        r.date = d.to_string();
        crate::calculate_day_without_windows(&r)
    });
    let definition: Definition = serde_json::from_str(DEFINITION)
        .map_err(|e| crate::Error::new("INVALID_WINDOW_DEFINITION", e.to_string()))?;
    let prayer = |d: &DayResult, name: &str| {
        let p = d
            .prayers
            .iter()
            .find(|p| p.name == name)
            .expect("compiled prayer");
        (
            p.raw.as_ref().map(|t| t.unix_seconds),
            p.status.clone(),
            p.unavailable_reason.clone(),
        )
    };
    let event = |name: &str| {
        let e = &day.solar[name];
        (e.instant(), "astronomical".to_string(), e.reason())
    };
    let next_fajr = match &next {
        Ok(d) => prayer(d, "fajr"),
        Err(e) => (
            None,
            "unavailable".into(),
            Some(format!("NEXT_DAY_{}", e.code)),
        ),
    };
    let resolve = |criterion: &Criterion| -> Result<Boundary> {
        let (time, mut status, reason) = match criterion {
            Criterion::TrueDawn => prayer(day, "fajr"),
            Criterion::Sunrise => event("sunrise"),
            Criterion::AfterTransit => event("solar_transit"),
            Criterion::OneShadow => (asr.instant(), "astronomical".into(), asr.reason()),
            Criterion::Sunset => event("sunset"),
            Criterion::RedTwilightProxy => {
                if matches!(
                    day.prayers[4].rule,
                    crate::rules::Rule::SolarDepression { .. }
                ) {
                    prayer(day, "isha")
                } else {
                    (
                        None,
                        "unavailable".into(),
                        Some("FIXED_INTERVAL_NOT_RED_TWILIGHT".into()),
                    )
                }
            }
            Criterion::NextTrueDawn => next_fajr.clone(),
            Criterion::FirstThirdOfNight => match (day.solar["sunset"].instant(), next_fajr.0) {
                (Some(s), Some(f)) if f > s && f - s <= 86400.0 => (
                    Some(s + (f - s) / 3.0),
                    if next_fajr.1 == "estimated" {
                        "estimated"
                    } else {
                        "derived"
                    }
                    .into(),
                    None,
                ),
                _ => (
                    None,
                    "unavailable".into(),
                    Some("REFERENCE_NIGHT_UNAVAILABLE".into()),
                ),
            },
        };
        if time.is_none() {
            status = "unavailable".into();
        }
        Ok(Boundary {
            criterion: criterion.clone(),
            status,
            raw: time.map(|t| civil::render(t, date, &tz)).transpose()?,
            displayed: time
                .map(|t| civil::render(civil::round_local(t, request.rounding, &tz)?, date, &tz))
                .transpose()?,
            unavailable_reason: reason,
        })
    };
    let mut windows = Vec::new();
    for d in &definition.windows {
        let start = resolve(&d.start)?;
        let end = resolve(&d.absolute_end)?;
        let preferred = d.preferred_until.as_ref().map(&resolve).transpose()?;
        let choice = d.choice_until.as_ref().map(&resolve).transpose()?;
        let necessity = d.necessity_until.as_ref().map(&resolve).transpose()?;
        let boundaries: Vec<&Boundary> = std::iter::once(&start)
            .chain(preferred.iter())
            .chain(choice.iter())
            .chain(necessity.iter())
            .chain(std::iter::once(&end))
            .collect();
        let invalid = match (&start.raw, &end.raw) {
            (Some(s), Some(e)) => {
                s.unix_seconds >= e.unix_seconds
                    || boundaries.iter().any(|b| {
                        b.raw.as_ref().is_some_and(|t| {
                            t.unix_seconds < s.unix_seconds || t.unix_seconds > e.unix_seconds
                        })
                    })
            }
            _ => false,
        };
        let status = if invalid {
            "invalid_order"
        } else if boundaries.iter().any(|b| b.raw.is_none()) {
            "incomplete"
        } else if boundaries.iter().any(|b| b.status == "estimated") {
            "estimated"
        } else {
            "available"
        };
        windows.push(PrayerWindow {
            prayer: d.prayer.clone(),
            status: status.into(),
            start,
            absolute_end: end,
            preferred_until: preferred,
            choice_until: choice,
            necessity_until: necessity,
        });
    }
    Ok(WindowSchedule {
        definition,
        windows,
    })
}
