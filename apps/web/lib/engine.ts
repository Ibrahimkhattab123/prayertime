export type CalculationRequest = {
  date: string;
  location: { latitude_deg: number; longitude_deg: number };
  timezone: string;
  profiles: { fiqh: string; calculation: string };
  high_latitude: string;
  rounding: string;
  ramadan: boolean | null;
  adjustments_minutes: Record<string, number>;
};
export type Instant = {
  utc: string;
  local: string;
  clock: string;
  date: string;
  day_offset: number;
  offset_seconds: number;
  unix_seconds: number;
};
export type Prayer = {
  name: string;
  status: string;
  criterion: string;
  rule: Record<string, string | number>;
  primary: Record<string, unknown>;
  raw: Instant | null;
  adjusted: Instant | null;
  displayed: Instant | null;
  unavailable_reason: string | null;
  fallback: {
    strategy: string;
    primary_failure: string;
    sunset_unix: number;
    sunrise_unix: number;
    fraction: number;
  } | null;
  adjustments: { minutes: number; category: string }[];
};
export type Day = {
  request: CalculationRequest;
  fingerprint: string;
  timezone_database: string;
  engine_version: string;
  astronomy_model: string;
  profile_package: string;
  prayers: Prayer[];
  solar: Record<string, unknown>;
  solar_local: Record<string, Instant | null>;
  solar_night_midpoint: Instant | null;
  warnings: string[];
};
export type Profiles = {
  package_version: string;
  status: string;
  source_status: string;
  source: string;
  methods: {
    id: string;
    name: string;
    fajr_angle: number;
    isha_angle: number | null;
    isha_minutes: number | null;
    ramadan_minutes: number | null;
  }[];
  fiqh: { id: string; name: string; asr_factor: number }[];
  limitations: string[];
};
type Wasm = {
  default: () => Promise<unknown>;
  calculateDay: (r: string) => string;
  calculateRange: (r: string, n: number) => string;
  validateConfiguration: (r: string) => string;
  listProfiles: () => string;
};
let engine: Promise<Wasm> | undefined;
export function loadEngine() {
  if (!engine) {
    const url = '/wasm/prayertime.js';
    engine = import(/* @vite-ignore */ url)
      .then(async (m) => {
        await m.default();
        return m as Wasm;
      })
      .catch((e) => {
        engine = undefined;
        throw e;
      });
  }
  return engine;
}
export async function calculate(request: CalculationRequest): Promise<Day> {
  const m = await loadEngine();
  return JSON.parse(m.calculateDay(JSON.stringify(request)));
}
export async function calculateRange(
  request: CalculationRequest,
  days: number,
): Promise<Day[]> {
  const m = await loadEngine();
  return JSON.parse(m.calculateRange(JSON.stringify(request), days));
}
export async function listProfiles(): Promise<Profiles> {
  return JSON.parse((await loadEngine()).listProfiles());
}
export const defaults: CalculationRequest = {
  date: '2026-09-09',
  location: { latitude_deg: 52.52, longitude_deg: 13.405 },
  timezone: 'Europe/Berlin',
  profiles: { fiqh: 'fiqh.shafii@1', calculation: 'calc.mwl@1' },
  high_latitude: 'none',
  rounding: 'nearest_minute',
  ramadan: null,
  adjustments_minutes: {},
};
export function today(timezone: string) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const get = (n: string) => parts.find((p) => p.type === n)?.value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}
export function dateLabel(date: string, locale = 'en-GB') {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`));
}
export function changeDate(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
