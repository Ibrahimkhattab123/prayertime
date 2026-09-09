//! Thin JSON bindings. The browser contains no prayer-time formulas.
use prayertime_core as core;
use wasm_bindgen::prelude::*;
fn err(e: impl std::fmt::Display) -> JsValue {
    JsValue::from_str(&e.to_string())
}
#[wasm_bindgen(js_name=calculateDay)]
pub fn calculate_day(request: &str) -> Result<String, JsValue> {
    let r = core::parse_request(request).map_err(err)?;
    serde_json::to_string(&core::calculate_day(&r).map_err(err)?).map_err(err)
}
#[wasm_bindgen(js_name=calculateRange)]
pub fn calculate_range(request: &str, days: usize) -> Result<String, JsValue> {
    let r = core::parse_request(request).map_err(err)?;
    serde_json::to_string(&core::calculate_range(&r, days).map_err(err)?).map_err(err)
}
#[wasm_bindgen(js_name=calculateSolarEvents)]
pub fn solar(request: &str) -> Result<String, JsValue> {
    let r = core::parse_request(request).map_err(err)?;
    serde_json::to_string(&core::calculate_solar_events(&r).map_err(err)?).map_err(err)
}
#[wasm_bindgen(js_name=validateConfiguration)]
pub fn validate(request: &str) -> Result<String, JsValue> {
    let r = core::parse_request(request).map_err(err)?;
    core::validate_configuration(&r).map_err(err)?;
    Ok("{\"valid\":true}".into())
}
#[wasm_bindgen(js_name=listProfiles)]
pub fn list_profiles() -> String {
    core::profiles::BASELINE.into()
}
