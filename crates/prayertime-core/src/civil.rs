//! Civil-time adapter using the same embedded tzdb on native and WASM.
use crate::{
    astronomy::{self, Longitude},
    model::*,
};
use jiff::{civil::Date, tz::TimeZone, Timestamp};

pub fn timezone(name: &str) -> Result<TimeZone> {
    let (canonical, bytes) = jiff_tzdb::get(name)
        .ok_or_else(|| Error::new("INVALID_TIMEZONE", format!("Unknown IANA timezone: {name}")))?;
    TimeZone::tzif(canonical, bytes).map_err(|e| Error::new("INVALID_TIMEZONE", e.to_string()))
}
pub fn date(value: &str) -> Result<Date> {
    let date: Date = value
        .parse()
        .map_err(|_| Error::new("INVALID_DATE", "Use a valid ISO date: YYYY-MM-DD"))?;
    if value != date.to_string() || !(1900..=2100).contains(&date.year()) {
        return Err(Error::new(
            "INVALID_DATE",
            "Supported date range is 1900-01-01 through 2100-12-31",
        ));
    }
    Ok(date)
}
pub fn shifted(date: Date, days: i64) -> Result<Date> {
    date.checked_add(jiff::Span::new().days(days))
        .map_err(|e| Error::new("INVALID_DATE", e.to_string()))
}
pub fn utc_midnight(date: Date) -> f64 {
    date.at(0, 0, 0, 0)
        .to_zoned(TimeZone::UTC)
        .expect("bounded date")
        .timestamp()
        .as_second() as f64
}
pub fn timestamp(seconds: f64) -> Result<Timestamp> {
    if !seconds.is_finite() {
        return Err(Error::new("INVALID_INSTANT", "Nonfinite timestamp"));
    }
    Timestamp::from_microsecond((seconds * 1e6).round() as i64)
        .map_err(|e| Error::new("INVALID_INSTANT", e.to_string()))
}
/// Select the UTC solar cycle whose transit falls on the requested local civil date.
/// Handles UTC+14 and longitude/timezone combinations without modulo-24 truncation.
pub fn solar_midnight(date: Date, tz: &TimeZone, lon: Longitude) -> Result<f64> {
    let base = utc_midnight(date);
    for offset in [0, -1, 1, -2, 2] {
        let midnight = base + offset as f64 * 86400.0;
        if let Some(t) = astronomy::transit(midnight, lon).instant() {
            if timestamp(t)?.to_zoned(tz.clone()).date() == date {
                return Ok(midnight);
            }
        }
    }
    Err(Error::new(
        "CIVIL_DATE_UNAVAILABLE",
        "No solar transit maps to this local date (possibly a skipped civil date)",
    ))
}
pub fn round(seconds: f64, mode: Rounding) -> f64 {
    match mode {
        Rounding::None => seconds,
        Rounding::NearestMinute => (seconds / 60.0 + 0.5).floor() * 60.0,
        Rounding::FloorMinute => (seconds / 60.0).floor() * 60.0,
        Rounding::CeilMinute => (seconds / 60.0).ceil() * 60.0,
    }
}
/// Round the civil clock, including historical offsets that contain seconds.
/// Jiff retains timezone transition and ambiguous-offset semantics.
pub fn round_local(seconds: f64, mode: Rounding, tz: &TimeZone) -> Result<f64> {
    if mode == Rounding::None {
        return Ok(seconds);
    }
    let mode = match mode {
        Rounding::NearestMinute => jiff::RoundMode::HalfExpand,
        Rounding::FloorMinute => jiff::RoundMode::Floor,
        Rounding::CeilMinute => jiff::RoundMode::Ceil,
        Rounding::None => unreachable!(),
    };
    let rounded = timestamp(seconds)?
        .to_zoned(tz.clone())
        .round(
            jiff::ZonedRound::new()
                .smallest(jiff::Unit::Minute)
                .mode(mode),
        )
        .map_err(|e| Error::new("ROUNDING_ERROR", e.to_string()))?;
    Ok(rounded.timestamp().as_microsecond() as f64 / 1e6)
}
pub fn render(seconds: f64, date: Date, tz: &TimeZone) -> Result<CivilInstant> {
    let ts = timestamp(seconds)?;
    let z = ts.to_zoned(tz.clone());
    let day_offset = ((utc_midnight(z.date()) - utc_midnight(date)) / 86400.0).round() as i64;
    Ok(CivilInstant {
        utc: ts.to_string(),
        local: z.to_string(),
        clock: format!("{:02}:{:02}", z.hour(), z.minute()),
        date: z.date().to_string(),
        day_offset,
        offset_seconds: z.offset().seconds(),
        unix_seconds: seconds,
    })
}
pub fn tzdb_version() -> String {
    format!(
        "IANA {} (embedded)",
        jiff_tzdb::VERSION.unwrap_or("unknown")
    )
}
