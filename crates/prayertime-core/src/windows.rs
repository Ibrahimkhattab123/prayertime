//! Explicit, opt-in draft windows. Timetable offsets never move these boundaries.
use crate::{astronomy, civil, DayResult, Result};
use serde::{Deserialize, Serialize};

pub const DEFINITIONS: [&str; 6] = [
    include_str!("../../../profiles/windows-shafii.json"),
    include_str!("../../../profiles/windows-hanafi-abu_hanifa.json"),
    include_str!("../../../profiles/windows-hanafi-sahibayn.json"),
    include_str!("../../../profiles/windows-maliki.json"),
    include_str!("../../../profiles/windows-hanbali-umdat.json"),
    include_str!("../../../profiles/windows-hanbali-third.json"),
];
#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum WindowProfile {
    #[default]
    None,
    ShafiiDraft,
    HanafiAbuHanifaDraft,
    HanafiSahibaynDraft,
    MalikiRisalaDraft,
    HanbaliUmdatDraft,
    HanbaliThirdDraft,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Criterion {
    TrueDawn,
    Sunrise,
    AfterTransit,
    OneShadow,
    TwoShadows,
    DaylightBrightness,
    Sunset,
    RedTwilightProxy,
    NextTrueDawn,
    FirstThirdOfNight,
    HalfOfNight,
    WhiteTwilight,
    SunYellowing,
    StarsVisible,
    MaghribPreparation,
    SunsetBeforeAsr,
    DawnBeforeIsha,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WindowDefinition {
    pub prayer: String,
    pub preferred_guidance: String,
    pub start: Criterion,
    pub absolute_end: Criterion,
    #[serde(default)]
    pub preferred_from: Option<Criterion>,
    pub preferred_until: Option<Criterion>,
    #[serde(default)]
    pub disliked_after: Option<Criterion>,
    #[serde(default)]
    pub necessity_from: Option<Criterion>,
    pub choice_until: Option<Criterion>,
    pub necessity_until: Option<Criterion>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Definition {
    pub id: String,
    pub status: String,
    pub name: String,
    pub summary: String,
    pub source_titles: Vec<String>,
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
    pub preferred_guidance: String,
    /// available, estimated, incomplete, or invalid_order; never silently reorder.
    pub status: String,
    pub start: Boundary,
    pub absolute_end: Boundary,
    /// None means unspecified, not equivalent to the absolute end.
    pub preferred_from: Option<Boundary>,
    pub preferred_until: Option<Boundary>,
    pub disliked_after: Option<Boundary>,
    pub necessity_from: Option<Boundary>,
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
    let preferred_asr = astronomy::shadow(midnight, lat, lon, 2.0);
    // Calculate the next civil day, not a local clock plus 24 hours (DST).
    let next = civil::shifted(date, 1).and_then(|d| {
        let mut r = request.clone();
        r.date = d.to_string();
        crate::calculate_day_without_windows(&r)
    });
    let index = match request.window_profile {
        WindowProfile::None => {
            return Err(crate::Error::new(
                "WINDOW_PROFILE_REQUIRED",
                "Choose a window profile",
            ))
        }
        WindowProfile::ShafiiDraft => 0,
        WindowProfile::HanafiAbuHanifaDraft => 1,
        WindowProfile::HanafiSahibaynDraft => 2,
        WindowProfile::MalikiRisalaDraft => 3,
        WindowProfile::HanbaliUmdatDraft => 4,
        WindowProfile::HanbaliThirdDraft => 5,
    };
    let definition: Definition = serde_json::from_str(DEFINITIONS[index])
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
            Criterion::TwoShadows => (
                preferred_asr.instant(),
                "astronomical".into(),
                preferred_asr.reason(),
            ),
            Criterion::DaylightBrightness => (
                None,
                "unavailable".into(),
                Some("DAYLIGHT_BRIGHTNESS_NOT_MODELED".into()),
            ),
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
            Criterion::WhiteTwilight => (
                None,
                "unavailable".into(),
                Some("WHITE_TWILIGHT_NOT_MODELED".into()),
            ),
            Criterion::SunYellowing => (
                None,
                "unavailable".into(),
                Some("SUN_YELLOWING_NOT_MODELED".into()),
            ),
            Criterion::StarsVisible => (
                None,
                "unavailable".into(),
                Some("STAR_VISIBILITY_NOT_MODELED".into()),
            ),
            Criterion::MaghribPreparation
            | Criterion::SunsetBeforeAsr
            | Criterion::DawnBeforeIsha => (
                None,
                "unavailable".into(),
                Some("PRAYER_DURATION_NOT_SPECIFIED".into()),
            ),
            Criterion::NextTrueDawn => next_fajr.clone(),
            Criterion::FirstThirdOfNight | Criterion::HalfOfNight => {
                match (day.solar["sunset"].instant(), next_fajr.0) {
                    (Some(s), Some(f)) if f > s && f - s <= 86400.0 => (
                        Some(
                            s + (f - s)
                                / if *criterion == Criterion::HalfOfNight {
                                    2.0
                                } else {
                                    3.0
                                },
                        ),
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
                }
            }
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
        let preferred_from = d.preferred_from.as_ref().map(&resolve).transpose()?;
        let preferred = d.preferred_until.as_ref().map(&resolve).transpose()?;
        let disliked = d.disliked_after.as_ref().map(&resolve).transpose()?;
        let necessity_from = d.necessity_from.as_ref().map(&resolve).transpose()?;
        let choice = d.choice_until.as_ref().map(&resolve).transpose()?;
        let necessity = d.necessity_until.as_ref().map(&resolve).transpose()?;
        let boundaries: Vec<&Boundary> = std::iter::once(&start)
            .chain(preferred_from.iter())
            .chain(preferred.iter())
            .chain(disliked.iter())
            .chain(necessity_from.iter())
            .chain(choice.iter())
            .chain(necessity.iter())
            .chain(std::iter::once(&end))
            .collect();
        let later_than = |a: Option<&Boundary>, b: Option<&Boundary>| {
            matches!((a.and_then(|x| x.raw.as_ref()), b.and_then(|x| x.raw.as_ref())),
                (Some(a), Some(b)) if a.unix_seconds > b.unix_seconds)
        };
        let invalid = matches!((&start.raw, &end.raw), (Some(s), Some(e)) if s.unix_seconds >= e.unix_seconds)
            || boundaries
                .iter()
                .any(|b| later_than(Some(&start), Some(b)) || later_than(Some(b), Some(&end)))
            || later_than(preferred_from.as_ref(), preferred.as_ref())
            || later_than(preferred.as_ref(), choice.as_ref())
            || later_than(choice.as_ref(), necessity_from.as_ref())
            || later_than(necessity_from.as_ref(), necessity.as_ref());
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
            preferred_guidance: d.preferred_guidance.clone(),
            status: status.into(),
            start,
            absolute_end: end,
            preferred_from,
            preferred_until: preferred,
            disliked_after: disliked,
            necessity_from,
            choice_until: choice,
            necessity_until: necessity,
        });
    }
    Ok(WindowSchedule {
        definition,
        windows,
    })
}
