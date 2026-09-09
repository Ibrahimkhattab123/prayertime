use serde::{Deserialize, Serialize};
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Method {
    pub id: String,
    pub name: String,
    pub fajr_angle: f64,
    pub isha_angle: Option<f64>,
    pub isha_minutes: Option<f64>,
    pub ramadan_minutes: Option<f64>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Fiqh {
    pub id: String,
    pub name: String,
    pub asr_factor: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Package {
    pub package_version: String,
    pub status: String,
    pub source_status: String,
    pub source: String,
    pub methods: Vec<Method>,
    pub fiqh: Vec<Fiqh>,
    pub limitations: Vec<String>,
}
pub const BASELINE: &str = include_str!("../../../profiles/baseline.json");
pub fn list_profiles() -> Package {
    serde_json::from_str(BASELINE).expect("embedded profile package tested at build time")
}
