'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Moon,
  Play,
  RotateCcw,
  Sun,
  Sunrise,
  Sunset,
} from 'lucide-react';
import { useLanguage } from '@/components/language';
import { type Day, type Instant, loadEngine } from '@/lib/engine';
import { localeFor, translate } from '@/lib/i18n';
import {
  asrShadowThreshold,
  createSolarDay,
  objectHeight,
  selectedSolarTime,
  shadowLength,
  sliderEnd,
  timeTravelKey,
  timeTravelSlider,
  type SolarDay,
  type SolarPosition,
} from '@/lib/solar';
import { SolarScene } from './scene';

const prayerMarkers = [
  ['fajr', 'Fajr', Sunrise],
  ['sunrise', 'Sunrise', Sunrise],
  ['dhuhr', 'Dhuhr', Sun],
  ['asr', 'Asr', Sun],
  ['maghrib', 'Maghrib', Sunset],
  ['isha', 'Isha', Moon],
] as const;

function displayedClock(day: Day, instant: Instant) {
  return day.request.rounding === 'none'
    ? instant.local.slice(11, 19)
    : instant.clock;
}

function useLiveTime(active: boolean, now: number) {
  const [time, setTime] = useState(now);
  useEffect(() => {
    if (!active) return;
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let last = -Infinity;
    const update = (timestamp: number) => {
      if (timestamp - last >= (reducedMotion.matches ? 1000 : 65)) {
        setTime(Date.now() / 1000);
        last = timestamp;
      }
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [active]);
  return active && Math.abs(now - time) < 2 ? time : now;
}

type Convention = { name: string; asr_factor: number } | undefined;

function SolarInformation({
  day,
  position,
  convention,
  result,
}: {
  day: SolarDay;
  position: SolarPosition;
  result: Day;
  convention: Convention;
}) {
  const { language } = useLanguage();
  const t = (value: string) => translate(value, language);
  const number = useMemo(
    () =>
      new Intl.NumberFormat(localeFor(language), {
        maximumFractionDigits: 2,
      }),
    [language],
  );
  const noon = useMemo(
    () =>
      day.transit === null
        ? null
        : shadowLength(day.position(day.transit).altitude),
    [day],
  );
  const threshold = asrShadowThreshold(
    result.prayers.find((prayer) => prayer.name === 'asr'),
  );
  const meters = (value: number | null) =>
    value === null ? '—' : `${number.format(value)} m`;
  const degrees = (value: number) => `${number.format(value)}°`;
  const fields = [
    ['Solar altitude', degrees(position.altitude)],
    ['Solar azimuth', degrees(position.azimuth)],
    ['Object height', meters(objectHeight)],
    ['Shadow length', meters(shadowLength(position.altitude))],
    ['Noon shadow', meters(noon)],
    ['Asr shadow threshold', meters(threshold)],
  ];
  return (
    <div className="solar-info">
      <p>
        {t(
          'After solar transit, the Asr criterion is the noon shadow plus the object height multiplied by the selected Asr factor.',
        )}
      </p>
      <p>
        <strong>{t('Asr convention')}</strong> ·{' '}
        {convention ? t(convention.name) : '—'}
        {convention && ` (×${number.format(convention.asr_factor)})`}
      </p>
      <dl>
        {fields.map(([label, value]) => (
          <div key={label}>
            <dt>{t(label)}</dt>
            <dd dir="ltr">{value}</dd>
          </div>
        ))}
      </dl>
      <p>
        {t(
          'The engine accounts for changing solar declination when solving for Asr.',
        )}
      </p>
      <p>
        {t(
          'Azimuth is measured clockwise from true north. Below the geometric horizon there is no direct shadow.',
        )}
      </p>
    </div>
  );
}

function InteractiveClock({
  result,
  day,
  now,
  liveDate,
  onToday,
  convention,
  simulation,
  setSimulation,
}: {
  result: Day;
  day: SolarDay;
  now: number;
  liveDate: boolean;
  onToday: () => void;
  convention: Convention;
  simulation: number | null;
  setSimulation: (value: number | null) => void;
}) {
  const { language } = useLanguage();
  const t = (value: string) => translate(value, language);
  const live = simulation === null && liveDate;
  const currentTime = useLiveTime(live, now);
  const selectedTime = selectedSolarTime(day, currentTime, live, simulation);
  const position = day.position(selectedTime);
  const slider = simulation ?? timeTravelSlider(day, selectedTime);
  const clockFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(localeFor(language), {
        timeZone: result.request.timezone,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }),
    [language, result.request.timezone],
  );
  const offsetFormat = useMemo(
    () =>
      new Intl.DateTimeFormat('en-GB', {
        timeZone: result.request.timezone,
        timeZoneName: 'shortOffset',
      }),
    [result.request.timezone],
  );
  const selectedSecond = Math.floor(selectedTime);
  const clockLabel = useMemo(
    () => clockFormat.format(selectedSecond * 1000),
    [clockFormat, selectedSecond],
  );
  const offset = useMemo(
    () =>
      offsetFormat
        .formatToParts(selectedSecond * 1000)
        .find((part) => part.type === 'timeZoneName')?.value,
    [offsetFormat, selectedSecond],
  );
  const timeLabel = simulation === sliderEnd ? '24:00' : clockLabel;
  const changingOffset = day.end - day.start !== 86400;
  const events = useMemo(
    () =>
      prayerMarkers.map(([key, label, Icon]) => {
        const prayer = result.prayers.find((prayer) => prayer.name === key);
        const instant =
          key === 'sunrise'
            ? result.solar_local.sunrise
            : (prayer?.displayed ?? null);
        const eventTime =
          key === 'sunrise' ? day.sunrise : (instant?.unix_seconds ?? null);
        const canSelect =
          eventTime !== null && eventTime >= day.start && eventTime < day.end;
        return {
          key,
          label,
          Icon,
          instant,
          eventTime,
          canSelect,
          estimated: prayer?.status === 'estimated',
        };
      }),
    [result, day],
  );
  const active = events.reduce<(typeof events)[number] | undefined>(
    (latest, event) => {
      const time = event.eventTime;
      return time !== null &&
        time <= selectedTime &&
        time >= (latest?.eventTime ?? -Infinity)
        ? event
        : latest;
    },
    undefined,
  );
  const markers = useMemo(
    () =>
      events.flatMap(({ key, eventTime }) =>
        eventTime === null
          ? []
          : [
              {
                key,
                position: day.position(eventTime),
                selected: key === active?.key,
              },
            ],
      ),
    [day, events, active?.key],
  );

  const returnToLive = () => {
    setSimulation(null);
    if (!liveDate) onToday();
  };

  return (
    <section className="solar-clock" aria-label={t('Solar clock')}>
      <div className="solar-stage">
        <div className="solar-stage-header">
          <span className={`clock-mode ${live ? 'is-live' : ''}`}>
            <span />
            {t(live ? 'Live' : 'Simulation')}
          </span>
          <div className="stage-time">
            <time dir="ltr">{timeLabel}</time>
            {changingOffset && <small dir="ltr">{offset}</small>}
            {active && <span>{t(active.label)}</span>}
          </div>
        </div>
        <SolarScene day={day} position={position} markers={markers} />
        <section className="solar-markers" aria-label={t('Prayer markers')}>
          {events.map(
            ({
              key,
              label,
              Icon,
              instant,
              eventTime,
              canSelect,
              estimated,
            }) => (
              <button
                type="button"
                key={key}
                disabled={!canSelect}
                className={`solar-marker ${active?.key === key ? 'is-current' : ''}`}
                aria-current={active?.key === key ? 'time' : undefined}
                title={instant?.local ?? t('Unavailable')}
                onClick={() => {
                  if (eventTime !== null)
                    setSimulation(timeTravelSlider(day, eventTime));
                }}
              >
                <Icon size={16} aria-hidden="true" />
                <span>{t(label)}</span>
                <strong dir="ltr">
                  {instant ? displayedClock(result, instant) : '—'}
                  {estimated && <span aria-hidden="true">*</span>}
                  {!!instant?.day_offset && (
                    <sup>
                      {instant.day_offset > 0 ? '+' : ''}
                      {instant.day_offset}d
                    </sup>
                  )}
                </strong>
                {estimated && <span className="sr-only">{t('Estimated')}</span>}
              </button>
            ),
          )}
        </section>
      </div>
      <div className="solar-controls">
        <div className="solar-controls-heading">
          <label htmlFor="solar-time-slider">
            <Play size={15} aria-hidden="true" />
            {t('Explore the day')}
          </label>
          <button
            type="button"
            onClick={returnToLive}
            disabled={live}
            className="solar-now"
          >
            <RotateCcw size={14} aria-hidden="true" />
            {t('Now')}
          </button>
        </div>
        <input
          dir="ltr"
          id="solar-time-slider"
          type="range"
          min="0"
          max={sliderEnd}
          step="any"
          value={slider}
          aria-describedby="solar-position-description"
          aria-valuetext={`${timeLabel} ${offset ?? ''}`}
          onChange={(event) => setSimulation(event.currentTarget.valueAsNumber)}
          onKeyDown={(event) => {
            const value = timeTravelKey(slider, event.key);
            if (value === null) return;
            event.preventDefault();
            setSimulation(value);
          }}
        />
        <div className="solar-scale" dir="ltr">
          <span>00:00</span>
          <span>24:00</span>
        </div>
        <p id="solar-position-description" className="sr-only">
          {t('Solar altitude')} {position.altitude.toFixed(1)}°.{' '}
          {t('Solar azimuth')} {position.azimuth.toFixed(1)}°.
        </p>
        <details className="solar-education">
          <summary>
            <BookOpen size={17} aria-hidden="true" />
            {t('Understand Prayer Times')}
          </summary>
          <SolarInformation
            day={day}
            position={position}
            convention={convention}
            result={result}
          />
        </details>
      </div>
    </section>
  );
}

export function SolarClock({
  result,
  now,
  onToday,
  convention,
  liveDate,
}: {
  result: Day;
  now: number;
  onToday: () => void;
  convention: Convention;
  liveDate: boolean;
}) {
  const { language } = useLanguage();
  const [simulation, setSimulation] = useState<number | null>(null);
  const [bundle, setBundle] = useState<{
    result: Day;
    data: SolarDay | null;
  } | null>(null);
  useEffect(() => {
    let active = true;
    void loadEngine()
      .then((engine) => createSolarDay(result, engine))
      .then(
        (data) => {
          if (active) setBundle({ result, data });
        },
        () => {
          if (active) setBundle({ result, data: null });
        },
      );
    return () => {
      active = false;
    };
  }, [result]);
  if (bundle?.result !== result || !bundle.data) {
    return (
      <output className="empty-state">
        {translate(
          bundle?.result === result
            ? 'Solar visualization unavailable'
            : 'Preparing solar visualization…',
          language,
        )}
      </output>
    );
  }
  return (
    <InteractiveClock
      day={bundle.data}
      result={result}
      now={now}
      liveDate={liveDate}
      onToday={onToday}
      convention={convention}
      simulation={simulation}
      setSimulation={setSimulation}
    />
  );
}
