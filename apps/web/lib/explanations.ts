import type { Day, Prayer } from './engine';
export type ExplanationSection = { title: string; paragraphs: string[] };
const number = (value: unknown, digits = 4) =>
  typeof value === 'number' && Number.isFinite(value)
    ? value.toFixed(digits)
    : null;
export function calculationExplanation(
  p: Prayer,
  day: Day,
): ExplanationSection[] {
  const sections: ExplanationSection[] = [];
  const fixed = p.rule.type === 'fixed_interval';
  const shadow = p.rule.type === 'shadow_factor';
  const transit = p.rule.event === 'solar_transit';
  const depression = p.rule.type === 'solar_depression';
  const { latitude_deg: latitude, longitude_deg: longitude } =
    day.request.location;
  let meaning: string;
  if (p.name === 'fajr')
    meaning = `Fajr uses the selected method’s ${p.rule.angle_deg}° solar-depression convention: the centre of the Sun must reach ${p.rule.angle_deg}° below the horizon while rising before sunrise. This angle is a computational proxy for true dawn; the app does not observe the sky or measure its brightness.`;
  else if (shadow)
    meaning = `Asr uses a shadow factor of ${p.rule.factor}. For a vertical object, the required shadow is its noon shadow plus ${p.rule.factor} times its height. Factor 1 is the shared Shafi‘i, Maliki and Hanbali convention, also used by the Hanafi Sahibayn choice; factor 2 is the Hanafi Abu Hanifa choice. The noon shadow is included, so this does not simply mean a total shadow of one or two object heights.`;
  else if (transit)
    meaning =
      'Dhuhr is placed at solar transit: the Sun crosses the local meridian. This is solar noon, which usually differs from 12:00 on the civil clock. The app adds no automatic precautionary delay after transit; any timetable adjustment is shown separately below.';
  else if (p.name === 'maghrib')
    meaning =
      'Maghrib uses standard apparent sunset. The engine solves for the centre of the Sun at −0.833° altitude on the descending evening path. This conventional angle approximates the combined effect of the solar disc’s radius and atmospheric refraction, so the upper edge is near the apparent horizon. Local mountains, observer elevation and actual weather are not modelled.';
  else if (fixed)
    meaning = `Isha uses a fixed interval of ${p.rule.minutes} minutes after raw astronomical sunset, rather than an evening twilight angle. For Umm al-Qura style, the explicitly selected Ramadan setting chooses 120 minutes instead of 90. Gulf and Qatar use 90 minutes in either case. The displayed Hijri date does not choose this setting.`;
  else
    meaning = `Isha uses the selected method’s ${p.rule.angle_deg}° solar-depression convention: the centre of the Sun must reach ${p.rule.angle_deg}° below the horizon while descending after sunset. This is a numerical twilight convention, not a direct observation of red or white shafaq.`;
  sections.push({ title: 'The criterion', paragraphs: [meaning] });
  const geometry = [
    `The calculation uses latitude ${latitude.toFixed(5)}° and longitude ${longitude.toFixed(5)}° for ${day.request.date}. East longitudes are positive. The engine selects the solar cycle whose transit belongs to that civil date in ${day.request.timezone}.`,
    'UTC seconds are converted to Julian date: JD = UTC seconds / 86,400 + 2,440,587.5. The approximate solar model then calculates the Sun’s orbital position, declination δ (its angle north or south of the equator), and the equation of time E (the difference between apparent and mean solar time).',
    'Solar transit in UTC hours relative to the selected solar-day anchor is 12 − longitude / 15 − E / 60, with E in minutes. Longitude sets the local meridian; the equation of time accounts for the changing apparent motion of the Sun.',
  ];
  if (!transit) {
    if (shadow)
      geometry.push(
        `The target solar altitude is h = arctan[1 / (${p.rule.factor} + tan(|φ − δ|))], where φ is latitude and δ is the recalculated solar declination. This is the engine’s standard shadow approximation; it updates δ as it refines the event time.`,
      );
    geometry.push(
      `For ${fixed ? 'the underlying sunset' : depression ? 'the requested twilight angle' : shadow ? 'that shadow altitude' : 'sunset'}, the hour angle H follows cos(H) = [sin(h) − sin(φ) sin(δ)] / [cos(φ) cos(δ)]. Angles are in degrees. H / 15 gives hours from solar transit: ${p.name === 'fajr' ? 'subtract this for the morning crossing' : 'add this for the evening crossing'}.`,
    );
    if (fixed)
      geometry.push(
        `After solving sunset at h = −0.833°, the engine adds ${p.rule.minutes} × 60 seconds to the raw sunset instant. Changing the displayed Maghrib time with a user adjustment cannot move this Isha base.`,
      );
  }
  geometry.push(
    'The usual solver repeatedly recalculates the solar position until successive times differ by less than 0.1 seconds, up to 12 iterations. For a crossing that the initial iteration cannot resolve, it checks the relevant half-day in one-minute brackets and refines a crossing with 24 bisections. This convergence threshold is numerical precision, not a claim of observational accuracy.',
  );
  sections.push({
    title: 'How the engine finds the time',
    paragraphs: geometry,
  });
  const dec = number(p.primary.declination_deg),
    eq = number(p.primary.equation_of_time_minutes),
    target = number(p.primary.target_altitude_deg);
  if (dec !== null && eq !== null) {
    const values = [
      `${fixed ? 'At the underlying sunset' : 'At the resolved primary event'}, the solar declination is ${dec}° and the equation of time is ${eq} minutes.${target === null ? '' : ` The target solar altitude is ${target}°.`}`,
    ];
    if (typeof p.primary.iterations === 'number')
      values.push(
        p.primary.iterations <= 12
          ? `The primary solar solver converged in ${p.primary.iterations} iterations.`
          : 'The primary solar crossing was resolved by the bounded bracket-and-bisection search.',
      );
    sections.push({ title: 'Values used for this result', paragraphs: values });
  }
  if (p.fallback) {
    const f = p.fallback;
    sections.push({
      title: 'Why this result is estimated',
      paragraphs: [
        `The requested angle event is absent. The selected ${f.strategy.replaceAll('_', ' ')} policy uses ${p.name === 'fajr' ? 'the previous sunset to this date’s sunrise' : 'this date’s sunset to the next sunrise'}. Its duration is ${(f.sunrise_unix - f.sunset_unix).toFixed(0)} seconds and the fraction is ${f.fraction.toFixed(6)}.`,
        p.name === 'fajr'
          ? 'Estimated Fajr = sunrise − fraction × night duration.'
          : 'Estimated Isha = sunset + fraction × night duration.',
        'Middle of the night uses 1/2, one seventh uses 1/7, and angle-based estimation uses the requested depression angle divided by 60. Estimation applies only when the primary event is absent; it does not replace an existing twilight event. No time is invented if the necessary sunset/sunrise reference is unavailable.',
      ],
    });
  } else if (!p.raw)
    sections.push({
      title: 'Why no time is shown',
      paragraphs: [
        'The primary event could not be resolved and no applicable estimate is available. At high latitudes, the Sun may never reach the requested altitude or the reference sunrise/sunset may be absent. Solver non-convergence is kept separate from religious estimation; a failed numerical solve is not permission to invent a prayer time.',
      ],
    });
  const rounding: Record<string, string> = {
    nearest_minute: 'rounded to the nearest local minute',
    ceil_minute: 'rounded up to the next local minute',
    floor_minute: 'rounded down to the local minute',
    none: 'shown without minute rounding',
  };
  sections.push({
    title: 'From the result to your clock',
    paragraphs: [
      `The raw UTC instant is preserved. Any listed timetable adjustment is then added in absolute minutes. The engine converts the result using ${day.request.timezone} and its date-specific UTC offset, including daylight saving time when applicable. Finally, the display is ${rounding[day.request.rounding] ?? day.request.rounding}. Rounded values never feed back into the astronomical calculation.`,
    ],
  });
  return sections;
}
