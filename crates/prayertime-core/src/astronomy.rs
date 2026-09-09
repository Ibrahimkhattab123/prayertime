//! Chapter 11 / 30 approximate solar model. All angles in degrees; instants in UTC.
use crate::model::{Error, Result};
use serde::{Deserialize, Serialize};

pub const MODEL: &str = "astronomy.standard@1-alpha";
pub const HORIZON_DEG: f64 = -0.833;
pub const CONVERGENCE_SECONDS: f64 = 0.1;
const MAX_ITERATIONS: usize = 12;
#[derive(Clone, Copy, Debug)]
pub struct Latitude(f64);
#[derive(Clone, Copy, Debug)]
pub struct Longitude(f64);
impl Latitude {
    pub fn new(x: f64) -> Result<Self> {
        if !x.is_finite() || !(-90.0..=90.0).contains(&x) {
            Err(Error::new(
                "INVALID_LATITUDE",
                "Latitude must be finite and between -90 and 90 degrees",
            ))
        } else {
            Ok(Self(x))
        }
    }
}
impl Longitude {
    pub fn new(x: f64) -> Result<Self> {
        if !x.is_finite() || !(-180.0..=180.0).contains(&x) {
            Err(Error::new(
                "INVALID_LONGITUDE",
                "Longitude must be finite and between -180 and 180 degrees",
            ))
        } else {
            Ok(Self(x))
        }
    }
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Direction {
    Morning,
    Evening,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum Event {
    Occurs {
        unix_seconds: f64,
        target_altitude_deg: Option<f64>,
        declination_deg: f64,
        equation_of_time_minutes: f64,
        iterations: usize,
    },
    Missing {
        reason: String,
    },
}
impl Event {
    pub fn instant(&self) -> Option<f64> {
        match self {
            Self::Occurs { unix_seconds, .. } => Some(*unix_seconds),
            _ => None,
        }
    }
    pub fn reason(&self) -> Option<String> {
        match self {
            Self::Missing { reason } => Some(reason.clone()),
            _ => None,
        }
    }
    pub fn missing(reason: &str) -> Self {
        Self::Missing {
            reason: reason.into(),
        }
    }
}
#[derive(Clone, Copy, Debug, Serialize)]
pub struct Coordinates {
    pub declination_deg: f64,
    pub equation_of_time_hours: f64,
    pub right_ascension_hours: f64,
}
fn sin(x: f64) -> f64 {
    x.to_radians().sin()
}
fn cos(x: f64) -> f64 {
    x.to_radians().cos()
}
pub fn julian_date(unix_seconds: f64) -> f64 {
    unix_seconds / 86400.0 + 2440587.5
}
pub fn coordinates(unix_seconds: f64) -> Coordinates {
    let d = julian_date(unix_seconds) - 2451545.0;
    let g = (357.529 + 0.98560028 * d).rem_euclid(360.0);
    let q = (280.459 + 0.98564736 * d).rem_euclid(360.0);
    let l = (q + 1.915 * sin(g) + 0.020 * sin(2.0 * g)).rem_euclid(360.0);
    let e = 23.439 - 0.00000036 * d;
    let dec = (sin(e) * sin(l)).asin().to_degrees();
    let ra = ((cos(e) * sin(l)).atan2(cos(l)).to_degrees() / 15.0).rem_euclid(24.0);
    let eq = (q / 15.0 - ra + 12.0).rem_euclid(24.0) - 12.0;
    Coordinates {
        declination_deg: dec,
        equation_of_time_hours: eq,
        right_ascension_hours: ra,
    }
}
/// UTC midnight identifying the solar day, chosen by the civil adapter.
pub fn transit(midnight: f64, lon: Longitude) -> Event {
    solve(midnight, Latitude(0.0), lon, None, Direction::Evening, None)
}
pub fn crossing(
    midnight: f64,
    lat: Latitude,
    lon: Longitude,
    altitude: f64,
    direction: Direction,
) -> Event {
    if !altitude.is_finite() || !(-90.0..=90.0).contains(&altitude) {
        return Event::missing("INVALID_ALTITUDE");
    }
    robust_solve(midnight, lat, lon, altitude, direction, None)
}
pub fn shadow(midnight: f64, lat: Latitude, lon: Longitude, factor: f64) -> Event {
    if !factor.is_finite() || factor <= 0.0 {
        return Event::missing("INVALID_SHADOW_FACTOR");
    }
    robust_solve(midnight, lat, lon, 0.0, Direction::Evening, Some(factor))
}
fn solve(
    midnight: f64,
    lat: Latitude,
    lon: Longitude,
    target: Option<f64>,
    direction: Direction,
    factor: Option<f64>,
) -> Event {
    let mut t = midnight + (12.0 - lon.0 / 15.0) * 3600.0;
    for iterations in 1..=MAX_ITERATIONS {
        let c = coordinates(t);
        let noon = midnight + (12.0 - lon.0 / 15.0 - c.equation_of_time_hours) * 3600.0;
        let h = if let Some(f) = factor {
            let z = (lat.0 - c.declination_deg).abs();
            if z >= 90.0 {
                return Event::missing("SUN_BELOW_HORIZON_FOR_SHADOW");
            }
            Some((1.0 / (f + z.to_radians().tan())).atan().to_degrees())
        } else {
            target
        };
        let next = if let Some(h) = h {
            let denominator = cos(lat.0) * cos(c.declination_deg);
            if denominator.abs() < 1e-14 {
                return Event::missing("NO_ALTITUDE_CROSSING_AT_POLE");
            }
            let x = (sin(h) - sin(lat.0) * sin(c.declination_deg)) / denominator;
            if !(-1.0 - 1e-12..=1.0 + 1e-12).contains(&x) {
                return Event::missing(if h == HORIZON_DEG {
                    if x > 1.0 {
                        "SUN_BELOW_HORIZON_ALL_DAY"
                    } else {
                        "SUN_ABOVE_HORIZON_ALL_DAY"
                    }
                } else {
                    "TARGET_ALTITUDE_NOT_REACHED"
                });
            }
            let seconds = x.clamp(-1.0, 1.0).acos().to_degrees() / 15.0 * 3600.0;
            noon + match direction {
                Direction::Morning => -seconds,
                Direction::Evening => seconds,
            }
        } else {
            noon
        };
        if (next - t).abs() < CONVERGENCE_SECONDS {
            return Event::Occurs {
                unix_seconds: next,
                target_altitude_deg: h,
                declination_deg: c.declination_deg,
                equation_of_time_minutes: c.equation_of_time_hours * 60.0,
                iterations,
            };
        }
        t = next;
    }
    Event::missing("SOLVER_DID_NOT_CONVERGE")
}
/// Diagnostic independent evaluation of altitude at an absolute instant.
pub fn altitude(unix: f64, lat: Latitude, lon: Longitude) -> f64 {
    let c = coordinates(unix);
    let utc_hour = unix.rem_euclid(86400.0) / 3600.0;
    let hour_angle = 15.0 * (utc_hour + lon.0 / 15.0 + c.equation_of_time_hours - 12.0);
    (sin(lat.0) * sin(c.declination_deg) + cos(lat.0) * cos(c.declination_deg) * cos(hour_angle))
        .clamp(-1.0, 1.0)
        .asin()
        .to_degrees()
}

// At seasonal boundaries noon geometry may report no crossing although the
// evolving declination produces one. Search the actual altitude equation before
// declaring absence; fixed-point iteration alone cannot certify absence.
fn robust_solve(
    midnight: f64,
    lat: Latitude,
    lon: Longitude,
    h: f64,
    direction: Direction,
    factor: Option<f64>,
) -> Event {
    let initial = solve(midnight, lat, lon, Some(h), direction, factor);
    if initial.instant().is_some() {
        return initial;
    }
    let Some(noon) = transit(midnight, lon).instant() else {
        return initial;
    };
    if factor.is_some() && (lat.0 - coordinates(noon).declination_deg).abs() >= 90.0 {
        return initial;
    }
    let residual = |t: f64| {
        let c = coordinates(t);
        let target = match factor {
            Some(f) => {
                let z = (lat.0 - c.declination_deg).abs();
                if z >= 90.0 {
                    return f64::NAN;
                }
                (1.0 / (f + z.to_radians().tan())).atan().to_degrees()
            }
            None => h,
        };
        altitude(t, lat, lon) - target
    };
    let (start, end) = match direction {
        Direction::Morning => (noon - 43200.0, noon),
        Direction::Evening => (noon, noon + 43200.0),
    };
    let mut a = start;
    let mut fa = residual(a);
    for step in 1..=720 {
        let b = start + (end - start) * step as f64 / 720.0;
        let fb = residual(b);
        let brackets = match direction {
            Direction::Morning => fa <= 0.0 && fb >= 0.0,
            Direction::Evening => fa >= 0.0 && fb <= 0.0,
        };
        if fa.is_finite() && fb.is_finite() && brackets {
            let (mut lo, mut hi) = (a, b);
            for _ in 0..24 {
                let mid = (lo + hi) / 2.0;
                let fm = residual(mid);
                if (fa <= 0.0 && fm <= 0.0) || (fa >= 0.0 && fm >= 0.0) {
                    lo = mid;
                } else {
                    hi = mid;
                }
            }
            let t = (lo + hi) / 2.0;
            let c = coordinates(t);
            return Event::Occurs {
                unix_seconds: t,
                target_altitude_deg: Some(altitude(t, lat, lon)),
                declination_deg: c.declination_deg,
                equation_of_time_minutes: c.equation_of_time_hours * 60.0,
                iterations: MAX_ITERATIONS + step + 24,
            };
        }
        a = b;
        fa = fb;
    }
    initial
}
