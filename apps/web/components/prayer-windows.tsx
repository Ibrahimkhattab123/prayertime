'use client';
import type { Day, WindowBoundary } from '@/lib/engine';
import { Localized } from '@/components/language';

const criteria: Record<string, string> = {
  true_dawn: 'True dawn · selected angle proxy',
  sunrise: 'Sunrise',
  after_transit: 'After solar transit',
  one_shadow: 'Noon shadow + one object-height',
  two_shadows: 'Noon shadow + twice the object-height',
  daylight_brightness: 'Daylight becomes bright (isfar)',
  sunset: 'Sunset',
  red_twilight_proxy: 'Red twilight · selected angle proxy',
  next_true_dawn: 'True dawn on the following date',
  first_third_of_night: 'One third of sunset to the following dawn',
};
const statuses: Record<string, string> = {
  available: 'Calculated',
  astronomical: 'Calculated',
  derived: 'Derived',
  estimated: 'Estimated',
  incomplete: 'Incomplete',
  unavailable: 'Unavailable',
  invalid_order: 'Conflicting boundaries',
};
const names: Record<string, string> = {
  fajr: 'Fajr',
  dhuhr: 'Dhuhr',
  asr: 'Asr',
  maghrib: 'Maghrib',
  isha: 'Isha',
};
function Boundary({ boundary }: { boundary: WindowBoundary }) {
  const t = boundary.displayed;
  return (
    <Localized>
      <div className="window-boundary">
        <strong dir="ltr">{t?.clock ?? '—'}</strong>
        {t && (
          <span className="window-date" dir="ltr">
            {t.date}
          </span>
        )}
        <span>{criteria[boundary.criterion]}</span>
        <span className="window-status">{statuses[boundary.status]}</span>
        {boundary.unavailable_reason === 'FIXED_INTERVAL_NOT_RED_TWILIGHT' && (
          <span>
            Fixed-minute Isha does not identify the end of red twilight.
          </span>
        )}
        {boundary.unavailable_reason === 'DAYLIGHT_BRIGHTNESS_NOT_MODELED' && (
          <span>
            No clock time: a validated local brightness criterion is needed.
          </span>
        )}
        {boundary.unavailable_reason &&
          ![
            'FIXED_INTERVAL_NOT_RED_TWILIGHT',
            'DAYLIGHT_BRIGHTNESS_NOT_MODELED',
          ].includes(boundary.unavailable_reason) && (
            <span className="field-note">{boundary.unavailable_reason}</span>
          )}
      </div>
    </Localized>
  );
}
export function PrayerWindows({ day }: { day: Day }) {
  return (
    <Localized>
      <section className="window-view">
        <h3>Prayer windows</h3>
        {!day.windows ? (
          <p>
            Choose “Shafi‘i windows · draft” in Calculation to show start and
            end boundaries.
          </p>
        ) : (
          <>
            <p>Shafi‘i windows · draft</p>
            <p className="field-note">
              This reference view uses one-shadow Asr independently of your
              timetable choice. Dawn and red twilight use the selected method’s
              angles as provisional proxies; they are not observed signs or a
              reviewed school profile.
            </p>
            <div className="window-list">
              {day.windows.windows.map((w) => (
                <article className="window-card" key={w.prayer}>
                  <header>
                    <h4>{names[w.prayer]}</h4>
                    <span className="window-status">{statuses[w.status]}</span>
                  </header>
                  {w.status === 'invalid_order' && (
                    <p>
                      These boundaries do not form a valid interval. Review the
                      method and estimation policy.
                    </p>
                  )}
                  <dl className="window-points">
                    <div>
                      <dt>Starts</dt>
                      <dd>
                        <Boundary boundary={w.start} />
                      </dd>
                    </div>
                    {w.preferred_until && (
                      <div>
                        <dt>Preferred until</dt>
                        <dd>
                          <Boundary boundary={w.preferred_until} />
                        </dd>
                      </div>
                    )}
                    <div>
                      <dt>Outer end</dt>
                      <dd>
                        <Boundary boundary={w.absolute_end} />
                      </dd>
                    </div>
                  </dl>
                  <div className="preferred-guidance">
                    <h5>Preferred time</h5>
                    <p>{w.preferred_guidance}</p>
                  </div>
                </article>
              ))}
            </div>
            <p className="field-note">
              Times use your display rounding, but window ordering uses
              unrounded instants. Timetable minute adjustments do not move these
              boundaries. Begin Dhuhr after transit; no precautionary delay is
              added.
            </p>
            <p className="field-note">
              An outer end does not mean every part of the interval is equally
              recommended. Asr and Isha have calculated preferred endpoints.
              Fajr’s brightness endpoint is shown without a clock time; Dhuhr
              and Maghrib have early-performance guidance. Choice and necessity
              subwindows remain unspecified.
            </p>
            <details className="fiqh-sources">
              <summary>Window sources and scope</summary>
              <ul>
                {day.windows.definition.sources.map((url, i) => (
                  <li key={url}>
                    <a href={url} target="_blank" rel="noreferrer">
                      {
                        [
                          'The Ship to Salvation · prayer boundaries',
                          'SeekersGuidance · Isha end and preferred time',
                          'SeekersGuidance · twilight angle limitations',
                          'SeekersGuidance · Asr preferred endpoint',
                          'SeekersGuidance · Fajr preferred endpoint',
                          'Reliance of the Traveller · f2.1–f2.2',
                        ][i]
                      }
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          </>
        )}
      </section>
    </Localized>
  );
}
