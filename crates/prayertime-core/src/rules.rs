//! Supported typed rule algebra. Profile selection compiles into these rules.
use crate::astronomy::{self, Direction, Event, Latitude, Longitude};
use serde::{Deserialize, Serialize};
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Rule {
    AtEvent {
        event: String,
    },
    SolarDepression {
        angle_deg: f64,
        direction: Direction,
    },
    ShadowFactor {
        factor: f64,
    },
    FixedInterval {
        base: String,
        minutes: f64,
    },
}
pub fn evaluate(rule: &Rule, midnight: f64, lat: Latitude, lon: Longitude) -> Event {
    match rule {
        Rule::AtEvent { event } => match event.as_str() {
            "solar_transit" => astronomy::transit(midnight, lon),
            "sunset" => astronomy::crossing(
                midnight,
                lat,
                lon,
                astronomy::HORIZON_DEG,
                Direction::Evening,
            ),
            _ => Event::missing("UNSUPPORTED_EVENT"),
        },
        Rule::SolarDepression {
            angle_deg,
            direction,
        } => astronomy::crossing(midnight, lat, lon, -angle_deg, *direction),
        Rule::ShadowFactor { factor } => astronomy::shadow(midnight, lat, lon, *factor),
        Rule::FixedInterval { base, minutes } => {
            let event = evaluate(
                &Rule::AtEvent {
                    event: base.clone(),
                },
                midnight,
                lat,
                lon,
            );
            match event {
                Event::Occurs {
                    unix_seconds,
                    declination_deg,
                    equation_of_time_minutes,
                    iterations,
                    ..
                } => Event::Occurs {
                    unix_seconds: unix_seconds + minutes * 60.0,
                    target_altitude_deg: None,
                    declination_deg,
                    equation_of_time_minutes,
                    iterations,
                },
                other => other,
            }
        }
    }
}
