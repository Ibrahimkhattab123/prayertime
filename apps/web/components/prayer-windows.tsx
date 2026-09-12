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
  half_of_night: 'Half of sunset to the following dawn',
  white_twilight: 'End of white twilight',
  sun_yellowing: 'Sunlight becomes yellow or weak',
  stars_visible: 'Stars become visible',
  maghrib_preparation: 'Time for Maghrib preparation and prayer',
  sunset_before_asr: 'Before the final portion reserved for Asr',
  dawn_before_isha: 'Before the final portion reserved for Isha',
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
const reasons: Record<string, string> = {
  FIXED_INTERVAL_NOT_RED_TWILIGHT:
    'Fixed-minute Isha does not identify the end of red twilight.',
  DAYLIGHT_BRIGHTNESS_NOT_MODELED:
    'No clock time: a validated local brightness criterion is needed.',
  WHITE_TWILIGHT_NOT_MODELED:
    'White twilight needs its own validated mapping; the timetable Isha angle is not reused.',
  SUN_YELLOWING_NOT_MODELED:
    'No clock time: yellowing depends on observation and atmospheric conditions.',
  STAR_VISIBILITY_NOT_MODELED: 'No clock time: star visibility is not modeled.',
  PRAYER_DURATION_NOT_SPECIFIED:
    'No clock time: the required preparation or prayer duration is not specified.',
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
        {boundary.unavailable_reason && (
          <span className="field-note">
            {reasons[boundary.unavailable_reason] ??
              boundary.unavailable_reason}
          </span>
        )}
      </div>
    </Localized>
  );
}
export function PrayerWindows({ day }: { day: Day }) {
  const windows = day.windows;
  return (
    <Localized>
      <section className="window-view">
        <h3>Prayer windows</h3>
        {!windows ? (
          <p>
            Choose a prayer-window profile in Calculation to show its
            school-specific boundaries.
          </p>
        ) : (
          <>
            <p>{windows.definition.name}</p>
            <p className="field-note">{windows.definition.summary}</p>
            <p className="field-note">
              Window profiles are independent of the timetable Asr convention.
              Dawn and red twilight use provisional angle proxies. Unmodeled
              signs remain unavailable; these draft accounts need qualified
              review.
            </p>
            <div className="window-list">
              {windows.windows.map((w) => (
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
                    {(
                      [
                        ['Preferred from', w.preferred_from],
                        ['Preferred until', w.preferred_until],
                        ['Ordinary time until', w.choice_until],
                        ['Disliked delay after', w.disliked_after],
                        [
                          'Necessity time from',
                          w.necessity_from?.criterion ===
                          w.choice_until?.criterion
                            ? null
                            : w.necessity_from,
                        ],
                        ['Necessity time until', w.necessity_until],
                      ] as [string, WindowBoundary | null][]
                    ).map(
                      ([label, boundary]) =>
                        boundary && (
                          <div key={label}>
                            <dt>{label}</dt>
                            <dd>
                              <Boundary boundary={boundary} />
                            </dd>
                          </div>
                        ),
                    )}
                    <div>
                      <dt>
                        {w.necessity_until
                          ? 'Outer end (conditional)'
                          : 'Outer end'}
                      </dt>
                      <dd>
                        <Boundary boundary={w.absolute_end} />
                      </dd>
                    </div>
                  </dl>
                  {w.necessity_until && (
                    <p className="field-note">
                      Necessity time requires a recognized excuse; it is not an
                      ordinary extension for everyone. Reserved prayer time and
                      ordering requirements still apply.
                    </p>
                  )}
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
              Preferred, ordinary, disliked-delay and necessity boundaries have
              different meanings. Read the selected account’s guidance; a
              missing boundary does not extend the permitted period.
            </p>
            <details className="fiqh-sources">
              <summary>Window sources and scope</summary>
              <ul>
                {windows.definition.sources.map((url, i) => (
                  <li key={url}>
                    <a href={url} target="_blank" rel="noreferrer">
                      {windows.definition.source_titles[i] ?? url}
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
