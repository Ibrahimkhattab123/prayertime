use a::{Direction, Latitude, Longitude};
use prayertime_core::{self as core, astronomy as a, civil, *};
fn request(date: &str, lat: f64, lon: f64, tz: &str) -> Request {
    serde_json::from_value(serde_json::json!({"date":date,"location":{"latitude_deg":lat,"longitude_deg":lon},"timezone":tz})).unwrap()
}
fn raw(d: &DayResult, name: &str) -> f64 {
    d.prayers
        .iter()
        .find(|p| p.name == name)
        .unwrap()
        .raw
        .as_ref()
        .unwrap()
        .unix_seconds
}
#[test]
fn usno_independent_reference_fixtures() {
    let fixtures: serde_json::Value =
        serde_json::from_str(include_str!("fixtures/usno.json")).unwrap();
    for f in fixtures["fixtures"].as_array().unwrap() {
        let params = &f["request_parameters"];
        let date = civil::date(params["date"].as_str().unwrap()).unwrap();
        let midnight = civil::utc_midnight(date);
        match f["kind"].as_str().unwrap() {
            "julian_date" => {
                let t = if params["time"] == "12:00:00" {
                    43200.0
                } else {
                    0.0
                };
                let expected: f64 = f["raw_response"]["data"][0]["jd"]
                    .as_str()
                    .unwrap()
                    .parse()
                    .unwrap();
                assert_eq!(a::julian_date(midnight + t), expected);
            }
            "solar_coordinates" => {
                let sun = f["raw_response"]["properties"]["data"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .find(|o| o["object"] == "Sun")
                    .unwrap();
                let expected = &sun["almanac_data"];
                let c = a::coordinates(midnight + 43200.0);
                assert!(
                    (c.declination_deg - expected["dec"].as_f64().unwrap()).abs() < 0.03,
                    "declination {}",
                    f["id"]
                );
                let e = (expected["gha"].as_f64().unwrap() + 180.0).rem_euclid(360.0) - 180.0;
                assert!(
                    (c.equation_of_time_hours - e / 15.0).abs() * 3600.0 < 10.0,
                    "equation of time {}",
                    f["id"]
                );
            }
            "solar_events" => {
                let coords: Vec<f64> = params["coords"]
                    .as_str()
                    .unwrap()
                    .split(',')
                    .map(|n| n.parse().unwrap())
                    .collect();
                let lat = Latitude::new(coords[0]).unwrap();
                let lon = Longitude::new(coords[1]).unwrap();
                let offset = params["tz"].as_str().unwrap().parse::<f64>().unwrap() * 3600.0;
                let sun = &f["raw_response"]["properties"]["data"]["sundata"];
                for (phen, dir) in [("Rise", Direction::Morning), ("Set", Direction::Evening)] {
                    let event = a::crossing(midnight, lat, lon, a::HORIZON_DEG, dir);
                    if let Some(reference) =
                        sun.as_array().unwrap().iter().find(|s| s["phen"] == phen)
                    {
                        let parts: Vec<f64> = reference["time"]
                            .as_str()
                            .unwrap()
                            .split(':')
                            .map(|s| s.parse().unwrap())
                            .collect();
                        let expected = midnight + parts[0] * 3600.0 + parts[1] * 60.0 - offset;
                        assert!(
                            (event.instant().unwrap() - expected).abs() < 60.0,
                            "{} {phen}: {:?}",
                            f["id"],
                            event
                        );
                    } else {
                        assert!(event.instant().is_none(), "polar {}", f["id"]);
                    }
                }
                if let Some(transit) = sun
                    .as_array()
                    .unwrap()
                    .iter()
                    .find(|s| s["phen"] == "Upper Transit")
                {
                    let parts: Vec<f64> = transit["time"]
                        .as_str()
                        .unwrap()
                        .split(':')
                        .map(|s| s.parse().unwrap())
                        .collect();
                    let expected = midnight + parts[0] * 3600.0 + parts[1] * 60.0 - offset;
                    assert!((a::transit(midnight, lon).instant().unwrap() - expected).abs() < 60.0);
                }
            }
            _ => panic!("unknown fixture"),
        }
    }
}
#[test]
fn seasonal_boundary_crossings_are_not_discarded() {
    for (date, lat, target) in [("2026-04-10", 64.0, -18.0), ("2026-06-02", 67.0, -0.833)] {
        let midnight = civil::utc_midnight(civil::date(date).unwrap());
        let lat = Latitude::new(lat).unwrap();
        let lon = Longitude::new(0.0).unwrap();
        let t = a::crossing(midnight, lat, lon, target, Direction::Morning)
            .instant()
            .expect("real crossing");
        assert!((a::altitude(t, lat, lon) - target).abs() < 1e-5);
        assert!(a::altitude(t + 2.0, lat, lon) > a::altitude(t - 2.0, lat, lon));
    }
}
#[test]
fn worldwide_seasonal_ordering_and_inverse_altitudes() {
    for (lat, lon, tz) in [
        (48.137, 11.575, "Europe/Berlin"),
        (21.4225, 39.8262, "Asia/Riyadh"),
        (-33.9249, 18.4241, "Africa/Johannesburg"),
        (1.3521, 103.8198, "Asia/Singapore"),
        (-0.1807, -78.4678, "America/Guayaquil"),
    ] {
        for date in ["2026-03-20", "2026-06-21", "2026-09-22", "2026-12-21"] {
            let mut r = request(date, lat, lon, tz);
            r.high_latitude = HighLatitude::OneSeventh;
            let d = core::calculate_day(&r).unwrap();
            let ordered = [
                raw(&d, "fajr"),
                d.solar["sunrise"].instant().unwrap(),
                raw(&d, "dhuhr"),
                raw(&d, "asr"),
                raw(&d, "maghrib"),
                raw(&d, "isha"),
            ];
            assert!(ordered.windows(2).all(|p| p[0] < p[1]), "{date} {lat}");
            for e in d.solar.values() {
                if let a::Event::Occurs {
                    unix_seconds,
                    target_altitude_deg: Some(h),
                    ..
                } = e
                {
                    assert!(
                        (a::altitude(
                            *unix_seconds,
                            Latitude::new(lat).unwrap(),
                            Longitude::new(lon).unwrap()
                        ) - h)
                            .abs()
                            < 1e-4
                    );
                }
            }
        }
    }
}
#[test]
fn asr_factor_and_method_are_independent() {
    let mut r = request("2026-04-10", 30.04, 31.24, "Africa/Cairo");
    let first = core::calculate_day(&r).unwrap();
    r.profiles.fiqh = "fiqh.hanafi_abu_hanifa@1".into();
    let second = core::calculate_day(&r).unwrap();
    assert!(raw(&second, "asr") > raw(&first, "asr"));
    for p in ["fajr", "dhuhr", "maghrib", "isha"] {
        assert_eq!(raw(&first, p), raw(&second, p));
    }
    r.profiles.calculation = "calc.isna@1".into();
    let third = core::calculate_day(&r).unwrap();
    assert_eq!(raw(&second, "asr"), raw(&third, "asr"));
    assert!(raw(&third, "fajr") > raw(&second, "fajr"));
    assert!(raw(&third, "isha") < raw(&second, "isha"));
}
#[test]
fn fixed_interval_uses_raw_sunset_and_explicit_ramadan() {
    let mut r = request("2026-03-01", 21.42, 39.82, "Asia/Riyadh");
    r.profiles.calculation = "calc.umm_al_qura@1".into();
    assert_eq!(
        core::calculate_day(&r).unwrap_err().code,
        "RAMADAN_CONTEXT_REQUIRED"
    );
    r.ramadan = Some(false);
    let d = core::calculate_day(&r).unwrap();
    assert_eq!(raw(&d, "isha") - raw(&d, "maghrib"), 5400.0);
    r.adjustments_minutes.insert("maghrib".into(), 10.0);
    let tuned = core::calculate_day(&r).unwrap();
    assert_eq!(raw(&d, "isha"), raw(&tuned, "isha"));
    assert_eq!(d.solar["sunset"].instant(), tuned.solar["sunset"].instant());
    r.ramadan = Some(true);
    let ramadan = core::calculate_day(&r).unwrap();
    assert_eq!(raw(&ramadan, "isha") - raw(&ramadan, "maghrib"), 7200.0);
}
#[test]
fn estimation_uses_each_correct_adjacent_night() {
    let mut r = request("2026-06-21", 52.52, 13.405, "Europe/Berlin");
    r.high_latitude = HighLatitude::OneSeventh;
    let d = core::calculate_day(&r).unwrap();
    let f = &d.prayers[0];
    let i = &d.prayers[4];
    assert_eq!(f.status, "estimated");
    assert_eq!(i.status, "estimated");
    let nf = f.fallback.as_ref().unwrap();
    let ni = i.fallback.as_ref().unwrap();
    assert!(nf.sunset_unix < ni.sunset_unix);
    assert_eq!(nf.sunrise_unix, d.solar["sunrise"].instant().unwrap());
    assert_eq!(ni.sunset_unix, d.solar["sunset"].instant().unwrap());
    assert!(
        (raw(&d, "fajr") - (nf.sunrise_unix - (nf.sunrise_unix - nf.sunset_unix) / 7.0)).abs()
            < 1e-6
    );
    assert!(f.primary.instant().is_none());
    r.date = "2026-03-20".into();
    let with = core::calculate_day(&r).unwrap();
    r.high_latitude = HighLatitude::None;
    let without = core::calculate_day(&r).unwrap();
    for p in ["fajr", "isha"] {
        assert_eq!(raw(&with, p), raw(&without, p));
    }
}
#[test]
fn polar_schedule_is_explicitly_unavailable() {
    for date in ["2026-06-21", "2026-12-21"] {
        let mut r = request(date, 69.6492, 18.9553, "Europe/Oslo");
        r.high_latitude = HighLatitude::MiddleOfNight;
        let d = core::calculate_day(&r).unwrap();
        assert!(d.solar["sunrise"].instant().is_none());
        assert!(d.solar["sunset"].instant().is_none());
        assert!(d.prayers[3].raw.is_none());
        assert!(d
            .prayers
            .iter()
            .filter(|p| p.raw.is_none())
            .all(|p| p.displayed.is_none() && p.unavailable_reason.is_some()));
    }
}
#[test]
fn timezone_dst_and_date_line() {
    for (date, offset) in [
        ("2026-03-28", 3600),
        ("2026-03-29", 7200),
        ("2026-10-24", 7200),
        ("2026-10-25", 3600),
    ] {
        let d = core::calculate_day(&request(date, 52.52, 13.405, "Europe/Berlin")).unwrap();
        assert_eq!(d.prayers[1].raw.as_ref().unwrap().offset_seconds, offset);
    }
    let d = core::calculate_day(&request(
        "2026-09-09",
        1.8721,
        -157.4278,
        "Pacific/Kiritimati",
    ))
    .unwrap();
    assert_eq!(d.prayers[1].raw.as_ref().unwrap().date, "2026-09-09");
    assert_eq!(d.prayers[1].raw.as_ref().unwrap().day_offset, 0);
    let skipped = request("2011-12-30", -13.833, -171.75, "Pacific/Apia");
    assert_eq!(
        core::calculate_day(&skipped).unwrap_err().code,
        "CIVIL_DATE_UNAVAILABLE"
    );
}
#[test]
fn night_elapsed_time_handles_dst() {
    let tz = civil::timezone("Europe/Berlin").unwrap();
    for (date, expected) in [("2026-03-28", 11.0), ("2026-10-24", 13.0)] {
        let day = civil::date(date).unwrap();
        let next = civil::shifted(day, 1).unwrap();
        let a = day
            .at(18, 0, 0, 0)
            .to_zoned(tz.clone())
            .unwrap()
            .timestamp()
            .as_second();
        let b = next
            .at(6, 0, 0, 0)
            .to_zoned(tz.clone())
            .unwrap()
            .timestamp()
            .as_second();
        assert_eq!((b - a) as f64 / 3600.0, expected);
    }
}
#[test]
fn rounding_is_last_and_preserves_date() {
    assert_eq!(civil::round(29.0, Rounding::NearestMinute), 0.0);
    assert_eq!(civil::round(30.0, Rounding::NearestMinute), 60.0);
    assert_eq!(civil::round(60.0, Rounding::CeilMinute), 60.0);
    assert_eq!(civil::round(-30.0, Rounding::NearestMinute), 0.0);
    let date = civil::date("2026-09-09").unwrap();
    let x = civil::render(
        civil::utc_midnight(date) + 86400.0,
        date,
        &civil::timezone("UTC").unwrap(),
    )
    .unwrap();
    assert_eq!(x.day_offset, 1);
    assert_eq!(x.date, "2026-09-10");
    let mut r = request("2026-09-09", 52.52, 13.405, "Europe/Berlin");
    let a = core::calculate_day(&r).unwrap();
    r.rounding = Rounding::CeilMinute;
    let b = core::calculate_day(&r).unwrap();
    assert_eq!(raw(&a, "isha"), raw(&b, "isha"));
    assert_ne!(a.fingerprint, b.fingerprint);
}
#[test]
fn invalid_inputs_and_bounded_ranges() {
    let mut r = request("2026-02-30", 0.0, 0.0, "UTC");
    assert!(core::calculate_day(&r).is_err());
    r.date = "2026-01-01".into();
    r.location.latitude_deg = f64::NAN;
    assert!(core::calculate_day(&r).is_err());
    r.location.latitude_deg = 91.0;
    assert!(core::calculate_day(&r).is_err());
    r.location.latitude_deg = 0.0;
    r.timezone = "Not/AZone".into();
    assert!(core::calculate_day(&r).is_err());
    r.timezone = "UTC".into();
    r.profiles.fiqh = "imaginary".into();
    assert!(core::calculate_day(&r).is_err());
    assert!(core::calculate_range(&r, 367).is_err());
    assert!(core::parse_request(r#"{"date":"2026-01-01","location":{"latitude_deg":0,"longitude_deg":0},"timezone":"UTC","typo":true}"#).is_err());
}
#[test]
fn fingerprints_normalize_zero_offsets() {
    let mut r = request("2026-09-09", 0.0, 0.0, "UTC");
    let a = core::calculate_day(&r).unwrap();
    r.adjustments_minutes.insert("fajr".into(), 0.0);
    r.location.latitude_deg = -0.0;
    let b = core::calculate_day(&r).unwrap();
    assert_eq!(a.fingerprint, b.fingerprint);
    r.adjustments_minutes.insert("fajr".into(), 1.0);
    assert_ne!(a.fingerprint, core::calculate_day(&r).unwrap().fingerprint);
}
#[test]
fn annual_high_latitude_regression() {
    for (lat, lon, tz) in [
        (52.52, 13.405, "Europe/Berlin"),
        (59.3293, 18.0686, "Europe/Stockholm"),
        (69.6492, 18.9553, "Europe/Oslo"),
    ] {
        let mut r = request("2026-01-01", lat, lon, tz);
        r.high_latitude = HighLatitude::AngleBased;
        let days = core::calculate_range(&r, 365).unwrap();
        assert_eq!(days.len(), 365);
        for d in days {
            for p in d.prayers {
                if let Some(t) = p.raw {
                    assert!(t.unix_seconds.is_finite());
                }
                if let Some(f) = p.fallback {
                    assert!(f.sunrise_unix > f.sunset_unix);
                    assert_eq!(f.trigger, "requested_event_absent");
                }
            }
        }
    }
}

#[test]
fn embedded_profiles_are_internally_valid() {
    let p = core::profiles::list_profiles();
    let mut ids = std::collections::BTreeSet::new();
    assert_eq!(p.status, "draft");
    assert_eq!(p.source_status, "provider_attributed");
    for m in p.methods {
        assert!(ids.insert(m.id));
        assert!(m.fajr_angle > 0.0 && m.fajr_angle < 30.0);
        assert_ne!(m.isha_angle.is_some(), m.isha_minutes.is_some());
        if let Some(angle) = m.isha_angle {
            assert!(angle > 0.0 && angle < 30.0);
        }
        if let Some(minutes) = m.isha_minutes {
            assert!(minutes > 0.0 && minutes < 180.0);
        }
        if m.ramadan_minutes.is_some() {
            assert!(m.isha_minutes.is_some());
        }
    }
    for f in p.fiqh {
        assert!(ids.insert(f.id));
        assert!([1.0, 2.0].contains(&f.asr_factor));
    }
}

#[test]
fn historical_second_offsets_round_the_local_clock() {
    let r = request("1900-01-01", -1.2864, 36.8172, "Africa/Nairobi");
    let day = core::calculate_day(&r).unwrap();
    let fajr = &day.prayers[0];
    assert_eq!(fajr.displayed.as_ref().unwrap().clock, "04:43");
    let tz = civil::timezone(&r.timezone).unwrap();
    for p in day.prayers {
        let displayed = civil::timestamp(p.displayed.unwrap().unix_seconds)
            .unwrap()
            .to_zoned(tz.clone());
        assert_eq!(displayed.second(), 0);
    }
}

#[test]
fn regional_method_parameters_match_attributed_snapshot() {
    let snapshot: serde_json::Value =
        serde_json::from_str(include_str!("../../../profiles/method-sources.json")).unwrap();
    let package = core::profiles::list_profiles();
    for (local, provider) in [
        ("egypt", "EGYPT"),
        ("gulf", "GULF"),
        ("kuwait", "KUWAIT"),
        ("qatar", "QATAR"),
        ("singapore", "SINGAPORE"),
        ("france", "FRANCE"),
        ("turkey", "TURKEY"),
        ("russia", "RUSSIA"),
        ("dubai", "DUBAI"),
        ("jakim", "JAKIM"),
        ("tunisia", "TUNISIA"),
        ("algeria", "ALGERIA"),
        ("kemenag", "KEMENAG"),
        ("morocco", "MOROCCO"),
    ] {
        let m = package
            .methods
            .iter()
            .find(|m| m.id == format!("calc.{local}@1"))
            .unwrap();
        let params = &snapshot["methods"][provider]["params"];
        assert_eq!(Some(m.fajr_angle), params["Fajr"].as_f64());
        if params["Isha"].is_number() {
            assert_eq!(m.isha_angle, params["Isha"].as_f64());
        } else {
            assert_eq!(params["Isha"].as_str(), Some("90 min"));
            assert_eq!(m.isha_minutes, Some(90.0));
            assert_eq!(m.ramadan_minutes, None);
        }
    }
}

#[test]
fn all_methods_resolve_with_explicit_ramadan_and_keep_fixed_interval_base() {
    for m in core::profiles::list_profiles().methods {
        for ramadan in [None, Some(false), Some(true)] {
            let mut r = request("2026-09-11", 30.0444, 31.2357, "Africa/Cairo");
            r.profiles.calculation = m.id.clone();
            r.ramadan = ramadan;
            r.adjustments_minutes.insert("maghrib".into(), 10.0);
            if m.ramadan_minutes.is_some() && ramadan.is_none() {
                assert!(core::calculate_day(&r).is_err());
                continue;
            }
            let d = core::calculate_day(&r).unwrap();
            assert!(d.prayers.iter().all(|p| p.raw.is_some()), "{}", m.id);
            if let Some(minutes) = m.isha_minutes {
                let expected = if ramadan == Some(true) {
                    m.ramadan_minutes.unwrap_or(minutes)
                } else {
                    minutes
                };
                assert_eq!(raw(&d, "isha") - raw(&d, "maghrib"), expected * 60.0);
            }
        }
    }
}
