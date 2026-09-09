use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Location {
    pub latitude_deg: f64,
    pub longitude_deg: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ProfileSelection {
    pub fiqh: String,
    pub calculation: String,
}
impl Default for ProfileSelection {
    fn default() -> Self {
        Self {
            fiqh: "fiqh.shafii@1".into(),
            calculation: "calc.mwl@1".into(),
        }
    }
}
#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum HighLatitude {
    #[default]
    None,
    MiddleOfNight,
    OneSeventh,
    AngleBased,
}
#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Rounding {
    #[default]
    NearestMinute,
    FloorMinute,
    CeilMinute,
    None,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Request {
    pub date: String,
    pub location: Location,
    pub timezone: String,
    #[serde(default)]
    pub profiles: ProfileSelection,
    #[serde(default)]
    pub high_latitude: HighLatitude,
    #[serde(default)]
    pub rounding: Rounding,
    #[serde(default)]
    pub adjustments_minutes: BTreeMap<String, f64>,
    /// Required for the conditional fixed-interval method. Never inferred from Gregorian date.
    #[serde(default)]
    pub ramadan: Option<bool>,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Error {
    pub code: String,
    pub message: String,
}
impl Error {
    pub fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
        }
    }
}
impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}
impl std::error::Error for Error {}
pub type Result<T> = std::result::Result<T, Error>;
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CivilInstant {
    pub utc: String,
    pub local: String,
    pub clock: String,
    pub date: String,
    pub day_offset: i64,
    pub offset_seconds: i32,
    pub unix_seconds: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Fallback {
    pub strategy: HighLatitude,
    pub trigger: String,
    pub primary_failure: String,
    pub sunset_unix: f64,
    pub sunrise_unix: f64,
    pub fraction: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Adjustment {
    pub category: String,
    pub minutes: f64,
    pub before_unix: f64,
    pub after_unix: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PrayerResult {
    pub name: String,
    pub status: String,
    pub criterion: String,
    pub rule: crate::rules::Rule,
    pub primary: crate::astronomy::Event,
    pub raw: Option<CivilInstant>,
    pub adjusted: Option<CivilInstant>,
    pub displayed: Option<CivilInstant>,
    pub unavailable_reason: Option<String>,
    pub fallback: Option<Fallback>,
    pub adjustments: Vec<Adjustment>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DayResult {
    pub schema_version: String,
    pub engine_version: String,
    pub astronomy_model: String,
    pub timezone_database: String,
    pub profile_package: String,
    pub fingerprint: String,
    pub request: Request,
    pub prayers: Vec<PrayerResult>,
    pub solar: BTreeMap<String, crate::astronomy::Event>,
    pub solar_local: BTreeMap<String, Option<CivilInstant>>,
    /// A sunset-to-next-sunrise midpoint, not a legal end of Isha.
    pub solar_night_midpoint: Option<CivilInstant>,
    pub warnings: Vec<String>,
}
