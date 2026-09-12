use prayertime_core::{self as core, windows::WindowProfile, *};
fn request(date: &str, lat: f64, lon: f64, tz: &str) -> Request {
    core::parse_request(&serde_json::json!({"date":date,"location":{"latitude_deg":lat,"longitude_deg":lon},"timezone":tz,"window_profile":"shafii_draft"}).to_string()).unwrap()
}
#[test]
fn boundaries_preserve_raw_dependencies_and_ignore_timetable_tuning() {
    let mut r = request("2026-09-12", 52.52, 13.405, "Europe/Berlin");
    let d = core::calculate_day(&r).unwrap();
    let w = &d.windows.as_ref().unwrap().windows;
    assert_eq!(w.len(), 5);
    assert_eq!(w[0].status, "incomplete");
    assert!(w[1..].iter().all(|w| w.status == "available"));
    assert_eq!(
        w[0].absolute_end.raw.as_ref().unwrap().unix_seconds,
        d.solar["sunrise"].instant().unwrap()
    );
    assert_eq!(
        w[1].absolute_end.raw.as_ref().unwrap().unix_seconds,
        w[2].start.raw.as_ref().unwrap().unix_seconds
    );
    assert_eq!(
        w[3].absolute_end.raw.as_ref().unwrap().unix_seconds,
        w[4].start.raw.as_ref().unwrap().unix_seconds
    );
    let night_start = d.solar["sunset"].instant().unwrap();
    let end = w[4].absolute_end.raw.as_ref().unwrap().unix_seconds;
    assert!(
        (w[4]
            .preferred_until
            .as_ref()
            .unwrap()
            .raw
            .as_ref()
            .unwrap()
            .unix_seconds
            - (night_start + (end - night_start) / 3.))
            .abs()
            < 1e-6
    );
    let brightness = w[0].preferred_until.as_ref().unwrap();
    assert!(brightness.raw.is_none() && brightness.displayed.is_none());
    assert_eq!(
        brightness.unavailable_reason.as_deref(),
        Some("DAYLIGHT_BRIGHTNESS_NOT_MODELED")
    );
    assert!(w[1].preferred_until.is_none() && w[3].preferred_until.is_none());
    assert!(w.iter().all(|w| !w.preferred_guidance.is_empty()));
    assert!(w
        .iter()
        .all(|w| w.choice_until.is_none() && w.necessity_until.is_none()));
    for name in ["fajr", "dhuhr", "asr", "maghrib", "isha"] {
        r.adjustments_minutes.insert(name.into(), 17.);
    }
    r.profiles.fiqh = "fiqh.hanafi_abu_hanifa@1".into();
    let changed = core::calculate_day(&r).unwrap();
    assert_eq!(
        serde_json::to_value(&d.windows).unwrap(),
        serde_json::to_value(&changed.windows).unwrap()
    );
    assert_ne!(
        d.prayers[2].raw.as_ref().unwrap().unix_seconds,
        changed.prayers[2].raw.as_ref().unwrap().unix_seconds
    );
    r.window_profile = WindowProfile::None;
    let off = core::calculate_day(&r).unwrap();
    assert!(off.windows.is_none());
    assert_ne!(off.fingerprint, changed.fingerprint);
}
#[test]
fn next_dawn_uses_next_civil_date_across_dst_and_date_line() {
    for (date, lat, lon, tz) in [
        ("2026-03-28", 52.52, 13.405, "Europe/Berlin"),
        ("2026-10-24", 52.52, 13.405, "Europe/Berlin"),
        ("2026-12-31", 1.8721, -157.4278, "Pacific/Kiritimati"),
    ] {
        let r = request(date, lat, lon, tz);
        let d = core::calculate_day(&r).unwrap();
        let mut next = r.clone();
        next.date = civil::shifted(civil::date(date).unwrap(), 1)
            .unwrap()
            .to_string();
        next.window_profile = WindowProfile::None;
        let next = core::calculate_day(&next).unwrap();
        let end = d.windows.unwrap().windows[4]
            .absolute_end
            .raw
            .clone()
            .unwrap();
        assert_eq!(
            end.unix_seconds,
            next.prayers[0].raw.as_ref().unwrap().unix_seconds
        );
        assert_eq!(end.date, next.request.date);
        assert_eq!(end.day_offset, 1);
    }
}
#[test]
fn unsupported_or_missing_boundary_does_not_erase_available_endpoints() {
    let mut r = request("2026-09-12", 52.52, 13.405, "Europe/Berlin");
    r.profiles.calculation = "calc.umm_al_qura@1".into();
    r.ramadan = Some(false);
    let d = core::calculate_day(&r).unwrap();
    let w = d.windows.unwrap().windows;
    assert_eq!(
        w[3].absolute_end.unavailable_reason.as_deref(),
        Some("FIXED_INTERVAL_NOT_RED_TWILIGHT")
    );
    assert!(w[3].start.raw.is_some());
    assert!(w[4].absolute_end.raw.is_some());
    assert_eq!(w[4].status, "incomplete");
    let r = request("2026-06-21", 69.6492, 18.9553, "Europe/Oslo");
    let w = core::calculate_day(&r).unwrap().windows.unwrap().windows;
    assert!(w[0].absolute_end.raw.is_none());
    assert!(w[1].start.raw.is_some());
    let r = request("2100-12-31", 52.52, 13.405, "Europe/Berlin");
    let w = core::calculate_day(&r).unwrap().windows.unwrap().windows;
    assert!(w[4].start.raw.is_some());
    assert!(w[4].absolute_end.raw.is_none());
    assert!(w[4]
        .absolute_end
        .unavailable_reason
        .as_ref()
        .unwrap()
        .starts_with("NEXT_DAY_"));
}
#[test]
fn estimates_are_marked_and_conflicting_intervals_are_not_repaired() {
    let mut r = request("2026-06-21", 52.52, 13.405, "Europe/Berlin");
    r.high_latitude = HighLatitude::OneSeventh;
    let w = core::calculate_day(&r).unwrap().windows.unwrap().windows;
    assert_eq!(w[0].start.status, "estimated");
    assert_eq!(w[4].absolute_end.status, "estimated");
    // A midpoint estimate starts Isha after the first third: retain and flag this conflict.
    r.high_latitude = HighLatitude::MiddleOfNight;
    let w = core::calculate_day(&r).unwrap().windows.unwrap().windows;
    assert_eq!(w[4].status, "invalid_order");
    assert!(w[4].preferred_until.as_ref().unwrap().raw.is_some());
}

#[test]
fn asr_preferred_boundary_solves_two_shadows_and_rounds_only_for_display() {
    for (date, lat, lon, tz) in [
        ("2026-09-12", 52.52, 13.405, "Europe/Berlin"),
        ("2026-03-29", 21.4225, 39.8262, "Asia/Riyadh"),
        ("2026-12-21", -33.87, 151.21, "Australia/Sydney"),
    ] {
        let mut r = request(date, lat, lon, tz);
        let d = core::calculate_day(&r).unwrap();
        let w = &d.windows.as_ref().unwrap().windows[2];
        let preferred = w.preferred_until.as_ref().unwrap();
        let t = preferred.raw.as_ref().unwrap().unix_seconds;
        assert_eq!(preferred.status, "astronomical");
        assert!(w.start.raw.as_ref().unwrap().unix_seconds < t);
        assert!(t < w.absolute_end.raw.as_ref().unwrap().unix_seconds);
        // Independent trigonometric check of the defining shadow ratio.
        let position = core::astronomy::coordinates(t);
        let altitude = core::astronomy::altitude(
            t,
            core::astronomy::Latitude::new(lat).unwrap(),
            core::astronomy::Longitude::new(lon).unwrap(),
        );
        let noon_shadow = (lat - position.declination_deg).to_radians().abs().tan();
        assert!((1.0 / altitude.to_radians().tan() - noon_shadow - 2.0).abs() < 0.001);
        r.rounding = Rounding::CeilMinute;
        let ceil = core::calculate_day(&r).unwrap();
        let b = ceil.windows.as_ref().unwrap().windows[2]
            .preferred_until
            .as_ref()
            .unwrap();
        assert_eq!(b.raw.as_ref().unwrap().unix_seconds, t);
        assert!(b.displayed.as_ref().unwrap().unix_seconds >= t);
    }
    let r = request("2026-12-21", 69.6492, 18.9553, "Europe/Oslo");
    let d = core::calculate_day(&r).unwrap();
    let b = d.windows.unwrap().windows[2]
        .preferred_until
        .clone()
        .unwrap();
    assert!(b.raw.is_none());
    assert_eq!(b.status, "unavailable");
}

#[test]
fn hanafi_opinions_keep_shadow_twilight_and_dislike_distinct() {
    let mut r = request("2026-09-12", 52.52, 13.405, "Europe/Berlin");
    r.window_profile = WindowProfile::HanafiAbuHanifaDraft;
    let abu = core::calculate_day(&r).unwrap();
    r.window_profile = WindowProfile::HanafiSahibaynDraft;
    let sahib = core::calculate_day(&r).unwrap();
    let a = &abu.windows.as_ref().unwrap().windows;
    let b = &sahib.windows.as_ref().unwrap().windows;
    assert!(
        a[2].start.raw.as_ref().unwrap().unix_seconds
            > b[2].start.raw.as_ref().unwrap().unix_seconds
    );
    assert_eq!(
        a[4].start.unavailable_reason.as_deref(),
        Some("WHITE_TWILIGHT_NOT_MODELED")
    );
    assert!(b[4].start.raw.is_some());
    assert_eq!(
        a[3].absolute_end.unavailable_reason.as_deref(),
        Some("WHITE_TWILIGHT_NOT_MODELED")
    );
    assert!(a[0].preferred_from.as_ref().unwrap().raw.is_none());
    assert!(a[0].preferred_until.is_none());
    assert_eq!(
        a[2].disliked_after
            .as_ref()
            .unwrap()
            .unavailable_reason
            .as_deref(),
        Some("SUN_YELLOWING_NOT_MODELED")
    );
    assert!(a.iter().all(|w| w.necessity_until.is_none()));
    assert_eq!(
        serde_json::to_value(&abu.prayers).unwrap(),
        serde_json::to_value(&sahib.prayers).unwrap()
    );
    assert_ne!(abu.fingerprint, sahib.fingerprint);
}

#[test]
fn school_night_boundaries_use_elapsed_sunset_to_dawn_across_dst() {
    for date in ["2026-03-28", "2026-10-24"] {
        for (profile, divisor) in [
            (WindowProfile::MalikiRisalaDraft, 3.0),
            (WindowProfile::HanbaliUmdatDraft, 2.0),
            (WindowProfile::HanbaliThirdDraft, 3.0),
            (WindowProfile::HanafiSahibaynDraft, 2.0),
        ] {
            let mut r = request(date, 52.52, 13.405, "Europe/Berlin");
            r.window_profile = profile;
            let d = core::calculate_day(&r).unwrap();
            let w = &d.windows.as_ref().unwrap().windows[4];
            let dawn = w.absolute_end.raw.as_ref().unwrap().unix_seconds;
            let sunset = d.solar["sunset"].instant().unwrap();
            let boundary = if profile == WindowProfile::HanafiSahibaynDraft {
                w.disliked_after.as_ref().unwrap()
            } else {
                w.choice_until.as_ref().unwrap()
            };
            assert!(
                (boundary.raw.as_ref().unwrap().unix_seconds
                    - (sunset + (dawn - sunset) / divisor))
                    .abs()
                    < 1e-6
            );
            assert_ne!(
                boundary.raw.as_ref().unwrap().unix_seconds,
                d.solar_night_midpoint.as_ref().unwrap().unix_seconds
            );
            if profile != WindowProfile::HanafiSahibaynDraft {
                assert_eq!(
                    boundary.raw.as_ref().unwrap().unix_seconds,
                    w.necessity_from
                        .as_ref()
                        .unwrap()
                        .raw
                        .as_ref()
                        .unwrap()
                        .unix_seconds
                );
                assert_eq!(
                    w.necessity_until
                        .as_ref()
                        .unwrap()
                        .raw
                        .as_ref()
                        .unwrap()
                        .unix_seconds,
                    dawn
                );
            }
            r.adjustments_minutes.insert("maghrib".into(), 30.0);
            r.adjustments_minutes.insert("fajr".into(), -15.0);
            let adjusted = core::calculate_day(&r).unwrap();
            assert_eq!(
                serde_json::to_value(&d.windows).unwrap(),
                serde_json::to_value(&adjusted.windows).unwrap()
            );
        }
    }
}

#[test]
fn maliki_reserved_time_and_hanbali_variants_are_not_conflated() {
    let mut r = request("2026-09-12", 52.52, 13.405, "Europe/Berlin");
    r.window_profile = WindowProfile::MalikiRisalaDraft;
    let d = core::calculate_day(&r).unwrap();
    let w = &d.windows.as_ref().unwrap().windows;
    for i in [1, 3] {
        assert!(w[i].start.raw.is_some());
        assert!(w[i].absolute_end.raw.is_none());
        assert_eq!(
            w[i].absolute_end.unavailable_reason.as_deref(),
            Some("PRAYER_DURATION_NOT_SPECIFIED")
        );
    }
    assert!(w[2].choice_until.as_ref().unwrap().raw.is_some());
    assert!(w[2].necessity_from.as_ref().unwrap().raw.is_none());
    r.window_profile = WindowProfile::HanbaliUmdatDraft;
    let u = core::calculate_day(&r).unwrap();
    r.window_profile = WindowProfile::HanbaliThirdDraft;
    let t = core::calculate_day(&r).unwrap();
    let u = &u.windows.as_ref().unwrap().windows;
    let t = &t.windows.as_ref().unwrap().windows;
    assert!(u[2].choice_until.as_ref().unwrap().raw.is_none());
    assert!(t[2].choice_until.as_ref().unwrap().raw.is_some());
    assert!(
        u[4].choice_until
            .as_ref()
            .unwrap()
            .raw
            .as_ref()
            .unwrap()
            .unix_seconds
            > t[4]
                .choice_until
                .as_ref()
                .unwrap()
                .raw
                .as_ref()
                .unwrap()
                .unix_seconds
    );
    assert_eq!(
        t[3].preferred_until
            .as_ref()
            .unwrap()
            .unavailable_reason
            .as_deref(),
        Some("STAR_VISIBILITY_NOT_MODELED")
    );
}

#[test]
fn window_catalog_schema_and_polar_partial_results_agree() {
    let schema: serde_json::Value =
        serde_json::from_str(include_str!("../../../profiles/request.schema.json")).unwrap();
    let profiles = schema["properties"]["window_profile"]["enum"]
        .as_array()
        .unwrap();
    assert_eq!(profiles.len(), core::windows::DEFINITIONS.len() + 1);
    let mut ids = std::collections::BTreeSet::new();
    for profile in profiles {
        let mut r = request("2026-06-21", 69.65, 18.96, "Europe/Oslo");
        r.window_profile = serde_json::from_value(profile.clone()).unwrap();
        let d = core::calculate_day(&r).unwrap();
        if profile == "none" {
            assert!(d.windows.is_none());
            continue;
        }
        let schedule = d.windows.unwrap();
        assert!(ids.insert(schedule.definition.id));
        assert_eq!(
            schedule.definition.sources.len(),
            schedule.definition.source_titles.len()
        );
        assert!(schedule.windows[1].start.raw.is_some());
        assert!(schedule.windows[0].absolute_end.raw.is_none());
        assert!(schedule.windows[4].absolute_end.raw.is_none());
    }
    assert!(core::parse_request(r#"{"date":"2026-09-12","location":{"latitude_deg":0,"longitude_deg":0},"timezone":"UTC","window_profile":"unknown"}"#).is_err());
}
