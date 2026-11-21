import type { Day, Prayer } from './engine';

export type SolarPosition = { altitude: number; azimuth: number };
export type Point = { x: number; y: number };
export type SolarDay = {
  start: number;
  end: number;
  position: (unix: number) => SolarPosition;
  sunrise: number | null;
  transit: number | null;
  sunset: number | null;
};

type SolarEngine = {
  solarPosition: (
    unix: number,
    latitude: number,
    longitude: number,
  ) => Float64Array;
  civilDayBounds: (date: string, timezone: string) => Float64Array;
};

export function createSolarDay(day: Day, engine: SolarEngine): SolarDay {
  const { date, timezone, location } = day.request;
  const [start, end] = engine.civilDayBounds(date, timezone);
  const raw = (key: string) => {
    const event = day.solar[key];
    return event?.status === 'occurs' ? event.unix_seconds : null;
  };
  return {
    start,
    end,
    position(unix) {
      const [altitude, azimuth] = engine.solarPosition(
        unix,
        location.latitude_deg,
        location.longitude_deg,
      );
      return { altitude, azimuth };
    },
    sunrise: raw('sunrise'),
    transit: raw('solar_transit'),
    sunset: raw('sunset'),
  };
}

const radians = (angle: number) => (angle * Math.PI) / 180;
export const horizon = -0.833;
export const objectHeight = 1.75;
const horizonTolerance = 0.0001;
export const sunIsVisible = (altitude: number) =>
  altitude >= horizon - horizonTolerance;
export const ground = { x: 400, y: 338, radius: 260, tilt: 0.3 };

export function shadowLength(altitude: number, height = objectHeight) {
  return altitude > 0 ? height / Math.tan(radians(altitude)) : null;
}

export function asrShadowThreshold(prayer: Prayer | undefined) {
  const altitude = prayer?.primary.target_altitude_deg;
  return typeof altitude === 'number' ? shadowLength(altitude) : null;
}

function horizontal(azimuth: number) {
  const angle = radians(azimuth);
  return { x: -Math.sin(angle), y: Math.cos(angle) };
}

export function projectSun({ altitude, azimuth }: SolarPosition): Point {
  const angle = radians(altitude);
  const bearing = horizontal(azimuth);
  const horizontalDistance = 280 * Math.cos(angle);
  return {
    x: ground.x + horizontalDistance * bearing.x,
    y:
      ground.y +
      horizontalDistance * ground.tilt * bearing.y -
      255 * Math.sin(angle),
  };
}

export function shadowVector(position: SolarPosition, height = objectHeight) {
  const length = shadowLength(position.altitude, height);
  if (length === null) return null;
  const direction = horizontal(position.azimuth + 180);
  return { x: direction.x * length, y: direction.y * length };
}

export function projectShadow(position: SolarPosition): Point | null {
  const vector = shadowVector(position);
  if (!vector) return null;
  const distance = Math.hypot(vector.x, vector.y);
  const limit = ground.radius - 22;
  const pixelsPerMeter = 66 / objectHeight;
  const scale =
    distance > 0
      ? (limit * Math.tanh((distance * pixelsPerMeter) / limit)) / distance
      : pixelsPerMeter;
  return { x: vector.x * scale, y: vector.y * scale * ground.tilt };
}

export function trajectory(day: SolarDay) {
  const times = Array.from(
    { length: 241 },
    (_, index) => day.start + ((day.end - day.start) * index) / 240,
  );
  for (const event of [day.sunrise, day.transit, day.sunset]) {
    if (event !== null && event >= day.start && event <= day.end)
      times.push(event);
  }
  times.sort((a, b) => a - b);
  let path = '';
  let previous: SolarPosition | undefined;
  for (const time of times) {
    const position = day.position(time);
    const visible = sunIsVisible(position.altitude);
    if (visible) {
      const { x, y } = projectSun(position);
      path += `${previous && sunIsVisible(previous.altitude) ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`;
    }
    previous = position;
  }
  return path;
}

export const sliderEnd = 1440;
const clampSlider = (value: number) => Math.max(0, Math.min(sliderEnd, value));

export function timeTravelSlider(
  day: Pick<SolarDay, 'start' | 'end'>,
  unix: number,
) {
  return clampSlider(((unix - day.start) / (day.end - day.start)) * sliderEnd);
}

const keySteps = new Map([
  ['ArrowLeft', -5],
  ['ArrowDown', -5],
  ['ArrowRight', 5],
  ['ArrowUp', 5],
  ['PageDown', -60],
  ['PageUp', 60],
  ['Home', -sliderEnd],
  ['End', sliderEnd],
]);

export function timeTravelKey(value: number, key: string) {
  const step = keySteps.get(key);
  return step === undefined ? null : clampSlider(value + step);
}

export function timeTravelUnix(
  day: Pick<SolarDay, 'start' | 'end'>,
  value: number,
) {
  return day.start + ((day.end - day.start) * clampSlider(value)) / sliderEnd;
}

export function selectedSolarTime(
  day: SolarDay,
  now: number,
  live: boolean,
  simulation: number | null,
) {
  if (live) return Math.max(day.start, Math.min(day.end, now));
  if (simulation !== null) return timeTravelUnix(day, simulation);
  return day.transit ?? (day.start + day.end) / 2;
}
