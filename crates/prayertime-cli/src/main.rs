use clap::{Args, Parser, Subcommand};
use prayertime_core::{self as core, Request};
use std::path::PathBuf;

#[derive(Parser)]
#[command(
    name = "prayertime",
    version,
    about = "PrayerTime development alpha — canonical Rust calculations"
)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}
#[derive(Args)]
struct Input {
    /// Load an exact calculation request from JSON instead of flags.
    #[arg(long)]
    request: Option<PathBuf>,
    #[arg(long, default_value = "2026-09-09")]
    date: String,
    #[arg(long, default_value_t = 52.52, allow_hyphen_values = true)]
    latitude: f64,
    #[arg(long, default_value_t = 13.405, allow_hyphen_values = true)]
    longitude: f64,
    #[arg(long, default_value = "Europe/Berlin")]
    timezone: String,
    #[arg(long, default_value = "calc.mwl@1")]
    method: String,
    #[arg(long, default_value = "fiqh.shafii@1")]
    fiqh: String,
    #[arg(long,default_value="none",value_parser=["none","middle_of_night","one_seventh","angle_based"])]
    high_latitude: String,
    #[arg(long,default_value="nearest_minute",value_parser=["nearest_minute","floor_minute","ceil_minute","none"])]
    rounding: String,
    #[arg(long,action=clap::ArgAction::Set)]
    ramadan: Option<bool>,
}
impl Input {
    fn read(&self) -> Result<Request, Box<dyn std::error::Error>> {
        if let Some(path) = &self.request {
            return Ok(core::parse_request(&std::fs::read_to_string(path)?)?);
        }
        Ok(serde_json::from_value(
            serde_json::json!({"date":self.date,"location":{"latitude_deg":self.latitude,"longitude_deg":self.longitude},"timezone":self.timezone,"profiles":{"fiqh":self.fiqh,"calculation":self.method},"high_latitude":self.high_latitude,"rounding":self.rounding,"ramadan":self.ramadan}),
        )?)
    }
}
#[derive(Subcommand)]
enum Command {
    /// Daily schedule, including raw instants and provenance as JSON.
    CalculateDay(Input),
    /// Same detailed result used by every interface.
    Explain(Input),
    /// Bounded date range (up to 366 days).
    CalculateRange {
        #[command(flatten)]
        input: Input,
        #[arg(long, default_value_t = 7)]
        days: usize,
    },
    /// Physical sunrise, solar transit and sunset only.
    Solar(Input),
    /// Inspect embedded draft methods, Asr profiles and source status.
    ListProfiles,
    /// Check request semantics and report validation errors.
    Validate(Input),
    /// Compare every built-in method while retaining other settings.
    CompareMethods(Input),
    /// Compare Asr profiles while retaining the calculation method.
    CompareFiqh(Input),
    /// Compare missing-twilight strategies.
    CompareHighlat(Input),
}
fn run() -> Result<(), Box<dyn std::error::Error>> {
    let value = match Cli::parse().command {
        Command::ListProfiles => serde_json::to_value(core::profiles::list_profiles())?,
        Command::CalculateDay(i) | Command::Explain(i) => {
            serde_json::to_value(core::calculate_day(&i.read()?)?)?
        }
        Command::CalculateRange { input, days } => {
            serde_json::to_value(core::calculate_range(&input.read()?, days)?)?
        }
        Command::Solar(i) => serde_json::to_value(core::calculate_solar_events(&i.read()?)?)?,
        Command::Validate(i) => {
            core::validate_configuration(&i.read()?)?;
            serde_json::json!({"valid":true})
        }
        Command::CompareMethods(i) => {
            let mut r = i.read()?;
            let mut out = Vec::new();
            for m in core::profiles::list_profiles().methods {
                r.profiles.calculation = m.id;
                out.push(match core::calculate_day(&r) {
                    Ok(d) => serde_json::to_value(d)?,
                    Err(e) => serde_json::json!({"method":r.profiles.calculation,"error":e}),
                });
            }
            serde_json::to_value(out)?
        }
        Command::CompareFiqh(i) => {
            let mut r = i.read()?;
            let mut out = Vec::new();
            for f in core::profiles::list_profiles().fiqh {
                r.profiles.fiqh = f.id;
                out.push(core::calculate_day(&r)?);
            }
            serde_json::to_value(out)?
        }
        Command::CompareHighlat(i) => {
            let mut r = i.read()?;
            let mut out = Vec::new();
            for h in [
                core::HighLatitude::None,
                core::HighLatitude::MiddleOfNight,
                core::HighLatitude::OneSeventh,
                core::HighLatitude::AngleBased,
            ] {
                r.high_latitude = h;
                out.push(core::calculate_day(&r)?);
            }
            serde_json::to_value(out)?
        }
    };
    println!("{}", serde_json::to_string_pretty(&value)?);
    Ok(())
}
fn main() {
    if let Err(e) = run() {
        eprintln!("{e}");
        std::process::exit(1);
    }
}
