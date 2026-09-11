'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  Sun,
  Sunrise,
  Sunset,
  Moon,
  MapPin,
  LocateFixed,
  ChevronLeft,
  ChevronRight,
  ArrowDownToLine,
  Info,
  LoaderCircle,
  ArrowUpRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  calculate,
  calculateRange,
  listProfiles,
  defaults,
  today,
  dateLabel,
  changeDate,
  type CalculationRequest,
  type Day,
  type Instant,
  type Profiles,
  type Prayer,
} from '@/lib/engine';
import { sameRequest, nextPrayer } from '@/lib/view-model';
import { CitySearch } from '@/components/city-search';
import {
  starterPlaces,
  readPlaces,
  rememberPlace,
  mergePlaces,
  type Place,
} from '@/lib/location';
import { detectTimezone } from '@/lib/timezone';
import { calculationExplanation } from '@/lib/explanations';
import { hijriDateLabel } from '@/lib/hijri';
import { ThemePicker } from '@/components/theme-picker';
import { fiqhExplanation, fiqhSources } from '@/lib/fiqh';
const STORAGE = 'prayertime-settings-v1';
const names: Record<string, string> = {
  fajr: 'Fajr',
  dhuhr: 'Dhuhr',
  asr: 'Asr',
  maghrib: 'Maghrib',
  isha: 'Isha',
};
const solarColumns = [
  ['sunrise', 'Sunrise'],
  ['solar_transit', 'Solar noon'],
  ['sunset', 'Sunset'],
] as const;
const subtitles: Record<string, string> = {
  fajr: 'Dawn',
  dhuhr: 'Midday',
  asr: 'Afternoon',
  maghrib: 'Sunset',
  isha: 'Night',
};
const highlat = [
  ['none', 'No estimation'],
  ['middle_of_night', 'Middle of the night'],
  ['one_seventh', 'One seventh of the night'],
  ['angle_based', 'Angle-based night portion'],
];
function Choice({
  label,
  value,
  items,
  onChange,
}: {
  label: string;
  value: string;
  items: [string, string][];
  onChange: (v: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <Select
        value={value}
        onValueChange={(v) => {
          if (v !== null) onChange(v);
        }}
      >
        <SelectTrigger className="w-full h-auto min-h-11 whitespace-normal">
          <SelectValue>
            {items.find((i) => i[0] === value)?.[1] ?? value}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {items.map(([id, title]) => (
            <SelectItem key={id} value={id}>
              {title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
function download(name: string, content: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function DayOffset({ instant }: { instant: Instant | null }) {
  return instant?.day_offset ? (
    <span className="day-offset">
      {instant.day_offset > 0 ? '+' : ''}
      {instant.day_offset} day
    </span>
  ) : null;
}
function ruleText(p: Prayer) {
  if (p.rule.type === 'solar_depression')
    return `${p.rule.angle_deg}° below the horizon`;
  if (p.rule.type === 'shadow_factor')
    return `Noon shadow + ${p.rule.factor} × object height`;
  if (p.rule.type === 'fixed_interval')
    return `${p.rule.minutes} minutes after raw solar sunset`;
  return p.rule.event === 'solar_transit'
    ? 'Solar transit · no automatic delay'
    : 'Sun at −0.833° · standard horizon';
}
function Explanation({ p, day }: { p: Prayer; day: Day }) {
  const explanation = calculationExplanation(p, day);
  return (
    <details className="explanation">
      <summary>
        How this time is calculated <ArrowUpRight size={14} />
      </summary>
      <div className="explanation-body">
        <section className="fiqh-note">
          <h4>When is this prayer? The fiqh perspective</h4>
          {fiqhExplanation(p.name, day.request.profiles.fiqh).map((text) => (
            <p key={text}>{text}</p>
          ))}
          <p className="muted">
            The Asr setting selects an Asr convention, not a complete school
            profile. Overview based on Chapter 18 of the research paper.
          </p>
          <details className="fiqh-sources">
            <summary>References</summary>
            <ul>
              {fiqhSources.map((source) => (
                <li key={source.url}>
                  <a href={source.url} target="_blank" rel="noreferrer">
                    {source.label}
                  </a>
                </li>
              ))}
            </ul>
          </details>
        </section>
        <p>
          <strong>{ruleText(p)}.</strong>
        </p>
        {explanation.map((section) => (
          <section key={section.title}>
            <h4>{section.title}</h4>
            {section.paragraphs.map((text) => (
              <p key={text}>{text}</p>
            ))}
          </section>
        ))}
        {p.fallback && (
          <p className="estimate-note">
            Estimated: {p.fallback.strategy.replaceAll('_', ' ')}. The primary
            event is absent ({p.fallback.primary_failure}). The reference night
            lasts{' '}
            {(
              (p.fallback.sunrise_unix - p.fallback.sunset_unix) /
              3600
            ).toFixed(2)}{' '}
            hours; the selected fraction is{' '}
            {(p.fallback.fraction * 100).toFixed(2)}%.
          </p>
        )}
        {p.unavailable_reason && (
          <p>
            No time can be resolved:{' '}
            {p.unavailable_reason.replaceAll('_', ' ').toLowerCase()}. Choose an
            explicit estimation policy for missing twilight. Basic night
            fractions cannot resolve a missing sunrise or sunset.
          </p>
        )}
        {p.raw && (
          <dl>
            <dt>Raw UTC</dt>
            <dd>{p.raw.utc}</dd>
            <dt>Local instant</dt>
            <dd>{p.adjusted?.local}</dd>
            <dt>Timetable adjustment</dt>
            <dd>
              {p.adjustments.length
                ? p.adjustments
                    .map(
                      (a) => `${a.minutes > 0 ? '+' : ''}${a.minutes} minutes`,
                    )
                    .join(', ')
                : 'None'}
            </dd>
          </dl>
        )}
        <p className="muted">
          Display rounding is applied after calculation and adjustment.
        </p>
      </div>
    </details>
  );
}
export default function Home() {
  const [request, setRequest] = useState<CalculationRequest>(defaults);
  const [profiles, setProfiles] = useState<Profiles | null>(null);
  const [day, setDay] = useState<Day | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(true);
  const [now, setNow] = useState(0);
  const [offline, setOffline] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [mode, setMode] = useState('daily');
  const [calendar, setCalendar] = useState<Day[] | null>(null);
  const [calendarBusy, setCalendarBusy] = useState(false);
  const [calendarError, setCalendarError] = useState('');
  const [locationBusy, setLocationBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [places, setPlaces] = useState<Place[]>(starterPlaces);
  const [manualOpen, setManualOpen] = useState(false);
  const calculationBlocked = busy || locationBusy || !request.timezone;
  const locationSequence = useRef(0);
  const cancelLocation = () => {
    locationSequence.current++;
    setLocationBusy(false);
  };
  const retainPlace = (place: Place) =>
    setPlaces(mergePlaces(rememberPlace(place), starterPlaces));
  const selectCity = (place: Place) => {
    cancelLocation();
    retainPlace(place);
    setRequest((r) => ({
      ...r,
      location: {
        latitude_deg: place.latitude,
        longitude_deg: place.longitude,
      },
      timezone: place.timezone,
    }));
    setNotice(
      `${place.name} selected. Timezone set to ${place.timezone}. Select “Calculate times” to update your timetable.`,
    );
  };

  const apply = useCallback(async (r: CalculationRequest, save = true) => {
    setBusy(true);
    setError('');
    try {
      const [result, p] = await Promise.all([calculate(r), listProfiles()]);
      setProfiles(p);
      setReady(true);
      setRequest(result.request);
      setDay(result);
      setCalendar(null);
      setCalendarError('');
      if (save) {
        try {
          localStorage.setItem(STORAGE, JSON.stringify(result.request));
        } catch {
          setNotice('Settings could not be saved in this browser.');
        }
      }
      return result;
    } catch (e) {
      setError(String(e));
      throw e;
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    let active = true;
    setPlaces(mergePlaces(readPlaces(), starterPlaces));
    (async () => {
      let r = { ...defaults };
      try {
        const saved = localStorage.getItem(STORAGE);
        if (saved) {
          r = JSON.parse(saved);
          r.date = today(r.timezone);
        }
      } catch {
        r = { ...defaults };
      }
      r.date = today(r.timezone);
      try {
        const p = await listProfiles();
        if (!active) return;
        let initial: Day;
        try {
          initial = await calculate(r);
        } catch {
          r = { ...defaults, date: today(defaults.timezone) };
          initial = await calculate(r);
          setNotice(
            'Saved settings could not be loaded. Default settings have been restored.',
          );
        }
        if (!active) return;
        setProfiles(p);
        setRequest(initial.request);
        setDay(initial);
        setReady(true);
        setBusy(false);
      } catch (e) {
        if (active) {
          setError(
            `Could not load the calculator or saved settings: ${String(e)}`,
          );
          setBusy(false);
        }
      }
    })();
    setNow(Date.now() / 1000);
    setOffline(!navigator.onLine);
    const tick = setInterval(() => setNow(Date.now() / 1000), 1000);
    const online = () => setOffline(!navigator.onLine);
    window.addEventListener('online', online);
    window.addEventListener('offline', online);
    return () => {
      active = false;
      locationSequence.current++;
      clearInterval(tick);
      window.removeEventListener('online', online);
      window.removeEventListener('offline', online);
    };
  }, [apply]);
  useEffect(() => {
    if (
      !('serviceWorker' in navigator) ||
      process.env.NODE_ENV !== 'production'
    )
      return;
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'OFFLINE_READY') setOfflineReady(true);
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    navigator.serviceWorker
      .register('/sw.js')
      .then(async (reg) => {
        const worker = reg.active ?? reg.waiting;
        worker?.postMessage({ type: 'CHECK_READY' });
      })
      .catch(() =>
        setNotice(
          'Offline installation failed. Calculation still works while this page is open.',
        ),
      );
    return () =>
      navigator.serviceWorker.removeEventListener('message', onMessage);
  }, []);
  const edit = (patch: Partial<CalculationRequest>) => {
    setRequest((r) => ({ ...r, ...patch }));
    setNotice('');
  };
  const dirty = day && !sameRequest(request, day.request);
  const matchPlace = (location: CalculationRequest['location']) =>
    places.find(
      (p) =>
        p.latitude === location.latitude_deg &&
        p.longitude === location.longitude_deg,
    );
  const place = day
    ? (matchPlace(day.request.location)?.name ?? 'Custom location')
    : 'Berlin';
  const selectedCity = matchPlace(request.location) ?? null;
  const method = profiles?.methods.find(
    (m) => m.id === request.profiles.calculation,
  );
  const resultMethod = profiles?.methods.find(
    (m) => m.id === day?.request.profiles.calculation,
  );
  const next =
    day && day.request.date === today(day.request.timezone)
      ? nextPrayer(day.prayers, now)
      : null;
  const remaining = next?.adjusted
    ? Math.max(0, Math.floor(next.adjusted.unix_seconds - now))
    : 0;
  const countdown = `${Math.floor(remaining / 3600)}h ${Math.floor((remaining % 3600) / 60)}m`;
  const navigate = async (delta: number) => {
    if (!day || calculationBlocked) return;
    const r = { ...request, date: changeDate(day.request.date, delta) };
    setRequest(r);
    await apply(r).catch(() => {});
  };
  const resolveCoordinates = async (
    latitude: number,
    longitude: number,
    sequence: number,
    label: string,
  ) => {
    try {
      const match = await detectTimezone(latitude, longitude);
      if (sequence !== locationSequence.current) return;
      const selected: Place = {
        id: `coordinates:${latitude}:${longitude}`,
        name: label,
        region: '',
        country: '',
        latitude,
        longitude,
        timezone: match.timezone,
      };
      retainPlace(selected);
      setRequest((r) => ({
        ...r,
        location: { latitude_deg: latitude, longitude_deg: longitude },
        timezone: match.timezone,
      }));
      setNotice(
        match.candidates.length > 1
          ? `Timezone set to ${match.timezone}. This location overlaps timezone boundaries; review the timezone under manual overrides.`
          : `Location and timezone (${match.timezone}) detected. Select “Calculate times” to update your timetable.`,
      );
    } catch (e) {
      if (sequence !== locationSequence.current) return;
      // Keep the new coordinates, but never pair them silently with the old timezone.
      setRequest((r) => ({
        ...r,
        location: { latitude_deg: latitude, longitude_deg: longitude },
        timezone: '',
      }));
      setManualOpen(true);
      setNotice(
        `Timezone lookup failed: ${String(e instanceof Error ? e.message : e)} You can retry or enter a timezone below.`,
      );
    } finally {
      if (sequence === locationSequence.current) setLocationBusy(false);
    }
  };
  const useLocation = () => {
    if (!navigator.geolocation) {
      setNotice(
        'Geolocation is unavailable. Search for a city or enter coordinates manually.',
      );
      return;
    }
    const sequence = ++locationSequence.current;
    setLocationBusy(true);
    setNotice('Finding your location and timezone…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (sequence !== locationSequence.current) return;
        void resolveCoordinates(
          Number(pos.coords.latitude.toFixed(6)),
          Number(pos.coords.longitude.toFixed(6)),
          sequence,
          'Current location',
        );
      },
      () => {
        if (sequence !== locationSequence.current) return;
        setNotice(
          'Location permission was denied or unavailable. Search for a city instead.',
        );
        setLocationBusy(false);
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 },
    );
  };
  const detectManualTimezone = () => {
    const sequence = ++locationSequence.current;
    setLocationBusy(true);
    void resolveCoordinates(
      request.location.latitude_deg,
      request.location.longitude_deg,
      sequence,
      'Custom coordinates',
    );
  };
  const editCoordinates = (location: CalculationRequest['location']) => {
    cancelLocation();
    edit({ location, timezone: '' });
  };
  const makeCalendar = async () => {
    if (!day) return;
    setCalendarBusy(true);
    setCalendarError('');
    try {
      const start = day.request.date.slice(0, 8) + '01';
      const days = new Date(
        Date.UTC(Number(start.slice(0, 4)), Number(start.slice(5, 7)), 0),
      ).getUTCDate();
      setCalendar(await calculateRange({ ...day.request, date: start }, days));
    } catch (e) {
      setCalendarError(String(e));
    } finally {
      setCalendarBusy(false);
    }
  };
  useEffect(() => {
    if (mode === 'month' && day && !calendar && !calendarBusy && !calendarError)
      void makeCalendar();
  }, [mode, day, calendar, calendarBusy, calendarError]);
  useEffect(() => {
    if (!ready) return;
    type ToolContext = {
      registerTool: (
        tool: unknown,
        options: { signal: AbortSignal },
      ) => unknown;
    };
    const context = (document as Document & { modelContext?: ToolContext })
      .modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      Promise.resolve(
        context.registerTool(
          {
            name: 'calculate_prayer_day',
            title: 'Calculate prayer day',
            description:
              'Validate an explicit request, calculate locally, and update the visible timetable. Does not save settings.',
            inputSchema: {
              type: 'object',
              properties: { request: { type: 'object' } },
              required: ['request'],
              additionalProperties: false,
            },
            annotations: { readOnlyHint: false },
            execute: async (input: unknown) => {
              const r = (input as { request: CalculationRequest }).request;
              const d = await calculate(r);
              flushSync(() => {
                cancelLocation();
                setRequest(d.request);
                setDay(d);
                setMode('daily');
                setCalendar(null);
                setError('');
              });
              return {
                date: d.request.date,
                prayers: d.prayers.map((p) => ({
                  name: p.name,
                  status: p.status,
                  time: p.displayed?.local ?? null,
                })),
                fingerprint: d.fingerprint,
              };
            },
          },
          { signal: lifecycle.signal },
        ),
      ).catch(() => {});
    } catch {}
    return () => lifecycle.abort();
  }, [ready]);
  return (
    <main className="shell">
      <header>
        <a className="brand" href="/" aria-label="PrayerTime home">
          <span className="brand-symbol">
            <Moon size={24} />
          </span>
          <span>PrayerTime</span>
        </a>
        <div className="header-meta">
          <ThemePicker />
          <span className="local-status">
            <span className="status-dot" />
            {offline
              ? 'Offline'
              : offlineReady
                ? 'Ready offline'
                : 'On-device calculation'}
          </span>
          <span className="version">0.1 · Development alpha</span>
        </div>
      </header>
      <section className="intro">
        <div>
          <p className="eyebrow">YOUR DAILY TIMETABLE</p>
          <h1>A day, in prayer.</h1>
          <p>Local calculations. Clear methods. Every time explained.</p>
        </div>
        {next && (
          <div className="up-next">
            <p>UP NEXT</p>
            <strong>
              {names[next.name]} <span>{next.displayed?.clock}</span>
            </strong>
            <span>
              in {countdown}
              {next.status === 'estimated' ? ' · estimated' : ''}
            </span>
          </div>
        )}
      </section>
      <div className="workspace">
        <form
          className="settings"
          onSubmit={(e) => {
            e.preventDefault();
            if (busy || locationBusy || !ready || !request.timezone) return;
            void apply(request).catch(() => {});
          }}
        >
          <div className="settings-heading">
            <MapPin size={18} />
            <h2>Location & date</h2>
          </div>
          <CitySearch
            disabled={!ready}
            value={selectedCity}
            places={places}
            offline={offline}
            onSelect={selectCity}
            onSearchStart={cancelLocation}
          />
          <Button
            type="button"
            variant="outline"
            onClick={useLocation}
            disabled={locationBusy || !ready}
          >
            {locationBusy ? <LoaderCircle className="spin" /> : <LocateFixed />}
            {locationBusy ? 'Finding location & timezone…' : 'Use my location'}
          </Button>
          <div className="detected-timezone">
            <span>Timezone</span>
            <strong>{request.timezone || 'Not set'}</strong>
            <small>Set automatically when you select a city or use GPS.</small>
          </div>
          <details
            className="location-overrides"
            open={manualOpen}
            onToggle={(e) => setManualOpen(e.currentTarget.open)}
          >
            <summary>Coordinates & timezone override</summary>
            <div className="coordinate-fields">
              <label>
                Latitude
                <Input
                  disabled={!ready}
                  required
                  type="number"
                  step="any"
                  min="-90"
                  max="90"
                  value={
                    Number.isNaN(request.location.latitude_deg)
                      ? ''
                      : request.location.latitude_deg
                  }
                  onChange={(e) =>
                    editCoordinates({
                      ...request.location,
                      latitude_deg: e.target.valueAsNumber,
                    })
                  }
                />
              </label>
              <label>
                Longitude
                <Input
                  disabled={!ready}
                  required
                  type="number"
                  step="any"
                  min="-180"
                  max="180"
                  value={
                    Number.isNaN(request.location.longitude_deg)
                      ? ''
                      : request.location.longitude_deg
                  }
                  onChange={(e) =>
                    editCoordinates({
                      ...request.location,
                      longitude_deg: e.target.valueAsNumber,
                    })
                  }
                />
              </label>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={locationBusy || !ready}
              onClick={detectManualTimezone}
            >
              Detect timezone from coordinates
            </Button>
            <label>
              Timezone override
              <Input
                disabled={!ready}
                required
                value={request.timezone}
                placeholder="Europe/Berlin"
                onChange={(e) => {
                  cancelLocation();
                  edit({ timezone: e.target.value });
                }}
              />
            </label>
            <p className="field-note">
              You can override the detected zone near a boundary.{' '}
              <a href="/timezone/NOTICE.txt" target="_blank" rel="noreferrer">
                Timezone data attribution
              </a>
              .
            </p>
          </details>
          <label>
            Date
            <Input
              required
              type="date"
              min="1900-01-01"
              max="2100-12-31"
              value={request.date}
              onChange={(e) => edit({ date: e.target.value })}
            />
          </label>
          <div className="settings-divider" />
          <div className="settings-heading">
            <Sun size={18} />
            <h2>Calculation</h2>
          </div>
          <Choice
            label="Calculation method"
            value={request.profiles.calculation}
            items={
              profiles?.methods.map((m) => [m.id, m.name]) ?? [
                ['calc.mwl@1', 'Muslim World League'],
              ]
            }
            onChange={(v) =>
              edit({ profiles: { ...request.profiles, calculation: v } })
            }
          />
          <p className="field-note">
            Regional angle/interval presets; local authority timetables may
            include additional corrections.{' '}
            <a
              href="https://aladhan.com/calculation-methods"
              target="_blank"
              rel="noreferrer"
            >
              Method sources
            </a>
            .
          </p>
          <Choice
            label="Asr convention"
            value={request.profiles.fiqh}
            items={
              profiles?.fiqh.map((f) => [f.id, f.name]) ?? [
                ['fiqh.shafii@1', 'Shafi‘i, Maliki & Hanbali Asr'],
              ]
            }
            onChange={(v) =>
              edit({ profiles: { ...request.profiles, fiqh: v } })
            }
          />
          {method?.ramadan_minutes !== null &&
            method?.ramadan_minutes !== undefined && (
              <Choice
                label="Ramadan context (required)"
                value={
                  request.ramadan === null ? 'unset' : String(request.ramadan)
                }
                items={[
                  ['unset', 'Select explicitly'],
                  ['false', 'Not Ramadan · 90 minutes'],
                  ['true', 'Ramadan · 120 minutes'],
                ]}
                onChange={(v) =>
                  edit({ ramadan: v === 'unset' ? null : v === 'true' })
                }
              />
            )}
          <Choice
            label="Missing twilight"
            value={request.high_latitude}
            items={highlat as [string, string][]}
            onChange={(v) => edit({ high_latitude: v })}
          />
          <p className="field-note">
            Estimation applies only when an angle event is absent. Polar days
            may remain unresolved.
          </p>
          <details className="advanced">
            <summary>Adjustments & rounding</summary>
            <div>
              <Choice
                label="Display rounding"
                value={request.rounding}
                items={[
                  ['nearest_minute', 'Nearest minute'],
                  ['ceil_minute', 'Round up'],
                  ['floor_minute', 'Round down'],
                  ['none', 'No rounding'],
                ]}
                onChange={(v) => edit({ rounding: v })}
              />
              <p className="field-note">
                Offsets tune the timetable. Raw sunset and dependent rules stay
                unchanged.
              </p>
              {Object.entries(names).map(([key, label]) => (
                <label className="offset-field" key={key}>
                  <span>
                    {label} <small>minutes</small>
                  </span>
                  <Input
                    type="number"
                    min="-120"
                    max="120"
                    step="any"
                    value={request.adjustments_minutes[key] ?? 0}
                    onChange={(e) =>
                      edit({
                        adjustments_minutes: {
                          ...request.adjustments_minutes,
                          [key]: e.target.valueAsNumber,
                        },
                      })
                    }
                  />
                </label>
              ))}
            </div>
          </details>
          <Button
            type="submit"
            className="calculate-button"
            disabled={busy || !ready || locationBusy || !request.timezone}
          >
            {busy ? <LoaderCircle className="spin" /> : <Sun size={18} />}{' '}
            {busy ? 'Calculating…' : 'Calculate times'}
          </Button>
          <p className="field-note">
            Settings are saved on this device after calculation. Your
            coordinates stay here.
          </p>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              cancelLocation();
              const r = { ...defaults, date: today(defaults.timezone) };
              setRequest(r);
              try {
                localStorage.removeItem(STORAGE);
              } catch {}
              void apply(r, false).catch(() => {});
            }}
          >
            Reset settings
          </Button>
        </form>
        <div className="results-column">
          {error && (
            <div role="alert" className="error">
              <strong>Unable to calculate</strong>
              <p>{error}</p>
              <Button
                variant="outline"
                disabled={calculationBlocked}
                onClick={() => void apply(request).catch(() => {})}
              >
                Try again
              </Button>
            </div>
          )}
          {notice && (
            <p className="notice" role="status">
              {notice}
            </p>
          )}
          {dirty && (
            <p className="notice" role="status">
              Settings changed. Select “Calculate times” to update the timetable
              below.
            </p>
          )}
          <section className="schedule" aria-busy={busy}>
            <div className="schedule-heading">
              <div>
                <p className="eyebrow">
                  {place.toUpperCase()}{' '}
                  {day && <span> / {day.request.timezone}</span>}
                </p>
                <h2>
                  {day
                    ? dateLabel(day.request.date)
                    : 'Preparing your timetable'}
                </h2>
                {day && (
                  <div
                    className="hijri-date"
                    title="Hijri calendar equivalent of the selected civil date, not a live sunset rollover. Ramadan context remains an explicit calculation setting."
                  >
                    <p>{hijriDateLabel(day.request.date)}</p>
                    <small>
                      Umm al-Qura calendar · local moon sighting may differ
                    </small>
                  </div>
                )}
              </div>
              <div className="date-navigation">
                <Button
                  type="button"
                  variant="ghost"
                  aria-label="Previous day"
                  disabled={
                    !day ||
                    calculationBlocked ||
                    day.request.date <= '1900-01-01'
                  }
                  onClick={() => void navigate(-1)}
                >
                  <ChevronLeft />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  aria-label="Next day"
                  disabled={
                    !day ||
                    calculationBlocked ||
                    day.request.date >= '2100-12-31'
                  }
                  onClick={() => void navigate(1)}
                >
                  <ChevronRight />
                </Button>
              </div>
            </div>
            <Tabs value={mode} onValueChange={setMode}>
              <div className="schedule-toolbar">
                <TabsList>
                  <TabsTrigger value="daily">Day</TabsTrigger>
                  <TabsTrigger value="month">Month</TabsTrigger>
                  <TabsTrigger value="research">Details</TabsTrigger>
                </TabsList>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!day || calculationBlocked}
                  onClick={() => {
                    const r = { ...request, date: today(request.timezone) };
                    setRequest(r);
                    void apply(r).catch(() => {});
                  }}
                >
                  Today
                </Button>
              </div>
              {mode === 'daily' && (
                <TabsContent value="daily" aria-label="Daily timetable">
                  {day ? (
                    day.prayers.map((p, index) => (
                      <div
                        className={`prayer-group ${next?.name === p.name ? 'is-next' : ''}`}
                        key={p.name}
                      >
                        <div className="prayer">
                          <span className="prayer-index">0{index + 1}</span>
                          <div>
                            <h3>
                              {names[p.name]}{' '}
                              {next?.name === p.name && (
                                <span className="next-tag">NEXT</span>
                              )}
                            </h3>
                            <span className="prayer-subtitle">
                              {subtitles[p.name]}
                            </span>
                          </div>
                          <div className="time-block">
                            <strong>
                              {p.displayed
                                ? day.request.rounding === 'none'
                                  ? p.displayed.local.slice(11, 19)
                                  : p.displayed.clock
                                : '—'}
                            </strong>
                            <DayOffset instant={p.displayed} />
                            <span className={`basis ${p.status}`}>
                              {p.status === 'astronomical'
                                ? 'Calculated'
                                : p.status === 'derived'
                                  ? 'Fixed interval'
                                  : p.status === 'estimated'
                                    ? 'Estimated'
                                    : 'Unavailable'}
                            </span>
                          </div>
                        </div>
                        <Explanation p={p} day={day} />
                      </div>
                    ))
                  ) : (
                    <p className="empty-state">
                      {busy
                        ? 'Loading the local calculation engine…'
                        : 'The calculation engine is not ready. See the message above.'}
                    </p>
                  )}
                </TabsContent>
              )}
              {mode === 'month' && (
                <TabsContent value="month" className="month-view">
                  <div className="month-heading">
                    <h3>{day?.request.date.slice(0, 7)} timetable</h3>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!calendar}
                      onClick={() => {
                        if (!calendar) return;
                        const rows = [
                          [
                            'Date',
                            'Hijri date (Umm al-Qura)',
                            ...Object.values(names),
                            ...solarColumns.map(([, label]) => label),
                          ],
                          ...calendar.map((d) => [
                            d.request.date,
                            hijriDateLabel(d.request.date),
                            ...d.prayers.map((p) =>
                              p.displayed
                                ? `${p.displayed.local} (${p.status})`
                                : `Unavailable: ${p.unavailable_reason}`,
                            ),
                            ...solarColumns.map(
                              ([key]) =>
                                d.solar_local[key]?.local ?? 'Unavailable',
                            ),
                          ]),
                        ];
                        download(
                          `prayertime-${day?.request.date.slice(0, 7)}.csv`,
                          rows
                            .map((r) =>
                              r
                                .map((c) => '"' + c.replaceAll('"', '""') + '"')
                                .join(','),
                            )
                            .join('\r\n'),
                          'text/csv',
                        );
                      }}
                    >
                      <ArrowDownToLine />
                      CSV
                    </Button>
                  </div>
                  <p className="field-note month-calendar-note">
                    Hijri dates use the Umm al-Qura calendar for each civil
                    date; local moon sighting may differ.
                  </p>
                  {day?.request.profiles.calculation ===
                    'calc.umm_al_qura@1' && (
                    <p className="notice">
                      This month uses the selected Ramadan context for every
                      day. Set dates individually when Ramadan begins or ends
                      within the month.
                    </p>
                  )}
                  {calendarBusy ? (
                    <p className="empty-state">
                      Calculating this month locally…
                    </p>
                  ) : calendarError ? (
                    <p role="alert">{calendarError}</p>
                  ) : (
                    calendar && (
                      <div className="table-scroll">
                        <table>
                          <caption className="sr-only">
                            Monthly prayer timetable with Gregorian and Umm
                            al-Qura Hijri dates, sunrise, solar noon and sunset;
                            asterisk marks estimated times.
                          </caption>
                          <thead>
                            <tr>
                              <th>Gregorian / Hijri</th>
                              {Object.values(names).map((n) => (
                                <th key={n}>{n}</th>
                              ))}
                              {solarColumns.map(([key, label]) => (
                                <th key={key}>{label}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {calendar.map((d) => (
                              <tr
                                key={d.request.date}
                                className={
                                  d.request.date === day?.request.date
                                    ? 'selected-day'
                                    : ''
                                }
                              >
                                <th scope="row" className="month-date">
                                  <time dateTime={d.request.date}>
                                    {d.request.date}
                                  </time>
                                  <span>{hijriDateLabel(d.request.date)}</span>
                                </th>
                                {d.prayers.map((p) => (
                                  <td
                                    key={p.name}
                                    title={
                                      p.displayed?.local ??
                                      p.unavailable_reason ??
                                      'Unavailable'
                                    }
                                  >
                                    {p.displayed?.clock ?? '—'}
                                    {p.status === 'estimated' && (
                                      <span className="estimated-mark">*</span>
                                    )}
                                    {p.displayed?.day_offset !== 0 &&
                                      p.displayed && (
                                        <sup>
                                          {p.displayed.day_offset > 0
                                            ? '+'
                                            : ''}
                                          {p.displayed.day_offset}d
                                        </sup>
                                      )}
                                  </td>
                                ))}
                                {solarColumns.map(([key]) => {
                                  const instant = d.solar_local[key];
                                  return (
                                    <td
                                      key={key}
                                      title={instant?.local ?? 'Unavailable'}
                                    >
                                      {instant?.clock ?? '—'}
                                      <DayOffset instant={instant ?? null} />
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )
                  )}
                  <p className="field-note">
                    * Estimated from the selected night fraction. — Unavailable.
                  </p>
                </TabsContent>
              )}
              {mode === 'research' && day && (
                <TabsContent value="research" className="research-view">
                  <h3>Calculation record</h3>
                  <p>
                    Each result retains its raw instant, adjustment history and
                    estimation basis.
                  </p>
                  <dl>
                    <dt>Method</dt>
                    <dd>{day.request.profiles.calculation}</dd>
                    <dt>Asr profile</dt>
                    <dd>{day.request.profiles.fiqh}</dd>
                    <dt>Astronomy</dt>
                    <dd>{day.astronomy_model}</dd>
                    <dt>Timezone data</dt>
                    <dd>{day.timezone_database}</dd>
                    <dt>Profiles</dt>
                    <dd>{day.profile_package} · provider attributed</dd>
                    <dt>Fingerprint</dt>
                    <dd className="fingerprint">{day.fingerprint}</dd>
                  </dl>
                  <Button
                    variant="outline"
                    onClick={() =>
                      download(
                        `prayertime-${day.request.date}.json`,
                        JSON.stringify(day, null, 2),
                      )
                    }
                  >
                    <ArrowDownToLine />
                    Download calculation JSON
                  </Button>
                  <details className="raw-record">
                    <summary>View complete result</summary>
                    <pre>{JSON.stringify(day, null, 2)}</pre>
                  </details>
                </TabsContent>
              )}
            </Tabs>
            {day && (
              <div className="solar-strip">
                {[
                  ['sunrise', 'Sunrise', Sunrise],
                  ['solar_transit', 'Solar noon', Sun],
                  ['sunset', 'Sunset', Sunset],
                ].map(([key, label, Icon]) => {
                  const instant = day.solar_local[key as string];
                  const SolarIcon = Icon as typeof Sun;
                  return (
                    <div key={key as string}>
                      <SolarIcon size={18} />
                      <span>
                        {label as string}
                        <strong>
                          {instant?.clock ?? '—'}
                          <DayOffset instant={instant} />
                        </strong>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
          {day && (
            <section className="method-note">
              <div>
                <Info size={19} />
                <h2>The method behind your day</h2>
              </div>
              <p>
                <strong>{resultMethod?.name}</strong> uses{' '}
                {resultMethod?.fajr_angle}° for Fajr and{' '}
                {resultMethod?.isha_angle !== null
                  ? `${resultMethod?.isha_angle}° for Isha`
                  : `${day.prayers.find((p) => p.name === 'isha')?.rule.minutes} minutes after raw sunset for Isha`}
                . Asr uses factor{' '}
                {
                  profiles?.fiqh.find((f) => f.id === day.request.profiles.fiqh)
                    ?.asr_factor
                }
                .{' '}
                {day.request.high_latitude === 'none'
                  ? 'No high-latitude estimation is selected.'
                  : `Missing twilight uses ${day.request.high_latitude.replaceAll('_', ' ')} estimation.`}
              </p>
              <details>
                <summary>
                  Scope & calculation notes <span>{day.warnings.length}</span>
                </summary>
                <ul>
                  {day.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
                <p>
                  Legal prayer windows, authority-specific polar rules and
                  observational dawn/twilight models are reserved for later
                  releases.
                </p>
              </details>
              {day.solar_night_midpoint && (
                <p className="midpoint">
                  Solar-night midpoint{' '}
                  <strong>{day.solar_night_midpoint.clock}</strong>
                  <DayOffset instant={day.solar_night_midpoint} />{' '}
                  <span>
                    Sunset to next sunrise; not a legal Isha deadline.
                  </span>
                </p>
              )}
            </section>
          )}
        </div>
      </div>
      <footer>
        <span>
          PrayerTime <span className="footer-dot">·</span> Research in the open
        </span>
        <span>Draft conventions · No authority verification claimed</span>
      </footer>
    </main>
  );
}
