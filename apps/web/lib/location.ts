/** Location discovery is a UI adapter; the prayer core still receives explicit inputs. */
export type Place = {
  id: string;
  name: string;
  region: string;
  country: string;
  latitude: number;
  longitude: number;
  timezone: string;
};
const CACHE_KEY = 'prayertime-places-v1';
export const starterPlaces: Place[] = [
  {
    id: 'starter:berlin',
    name: 'Berlin',
    region: 'Berlin',
    country: 'Germany',
    latitude: 52.52,
    longitude: 13.405,
    timezone: 'Europe/Berlin',
  },
  {
    id: 'starter:makkah',
    name: 'Makkah',
    region: 'Makkah',
    country: 'Saudi Arabia',
    latitude: 21.4225,
    longitude: 39.8262,
    timezone: 'Asia/Riyadh',
  },
  {
    id: 'starter:cairo',
    name: 'Cairo',
    region: 'Cairo',
    country: 'Egypt',
    latitude: 30.0444,
    longitude: 31.2357,
    timezone: 'Africa/Cairo',
  },
  {
    id: 'starter:karachi',
    name: 'Karachi',
    region: 'Sindh',
    country: 'Pakistan',
    latitude: 24.8607,
    longitude: 67.0011,
    timezone: 'Asia/Karachi',
  },
  {
    id: 'starter:london',
    name: 'London',
    region: 'England',
    country: 'United Kingdom',
    latitude: 51.5074,
    longitude: -0.1278,
    timezone: 'Europe/London',
  },
  {
    id: 'starter:singapore',
    name: 'Singapore',
    region: '',
    country: 'Singapore',
    latitude: 1.3521,
    longitude: 103.8198,
    timezone: 'Asia/Singapore',
  },
  {
    id: 'starter:capetown',
    name: 'Cape Town',
    region: 'Western Cape',
    country: 'South Africa',
    latitude: -33.9249,
    longitude: 18.4241,
    timezone: 'Africa/Johannesburg',
  },
  {
    id: 'starter:tromso',
    name: 'Tromsø',
    region: 'Troms',
    country: 'Norway',
    latitude: 69.6492,
    longitude: 18.9553,
    timezone: 'Europe/Oslo',
  },
];
export function validCoordinates(
  latitude: unknown,
  longitude: unknown,
): boolean {
  return (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  );
}
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function validPlace(value: unknown): value is Place {
  return (
    record(value) &&
    ['id', 'name', 'region', 'country', 'timezone'].every(
      (k) => typeof value[k] === 'string',
    ) &&
    Boolean(value.id) &&
    Boolean(value.name) &&
    Boolean(value.timezone) &&
    validCoordinates(value.latitude, value.longitude)
  );
}
export function placeLabel(p: Place): string {
  return [...new Set([p.name, p.region, p.country].filter(Boolean))].join(', ');
}
export function mergePlaces(...groups: Place[][]): Place[] {
  const seen: Place[] = [];
  return groups.flat().filter((p) => {
    if (
      seen.some(
        (other) =>
          other.id === p.id ||
          (p.country
            ? normalize(placeLabel(other)) === normalize(placeLabel(p)) &&
              other.timezone === p.timezone &&
              Math.abs(other.latitude - p.latitude) < 0.05 &&
              Math.abs(other.longitude - p.longitude) < 0.05
            : !other.country &&
              other.latitude === p.latitude &&
              other.longitude === p.longitude),
      )
    )
      return false;
    seen.push(p);
    return true;
  });
}
function normalize(value: string) {
  return value
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(
      /[øłđßæœ]/g,
      (c) => ({ ø: 'o', ł: 'l', đ: 'd', ß: 'ss', æ: 'ae', œ: 'oe' })[c]!,
    )
    .trim();
}
export function filterPlaces(places: Place[], query: string): Place[] {
  const words = normalize(query)
    .split(/[\s,]+/)
    .filter(Boolean);
  return places
    .filter((p) =>
      words.every((word) => normalize(placeLabel(p)).includes(word)),
    )
    .slice(0, 12);
}
export function readPlaces(storage?: Pick<Storage, 'getItem'>): Place[] {
  try {
    const data = JSON.parse(
      (storage ?? globalThis.localStorage)?.getItem(CACHE_KEY) ?? '[]',
    );
    return Array.isArray(data) ? data.filter(validPlace).slice(0, 20) : [];
  } catch {
    return [];
  }
}
export function rememberPlace(
  place: Place,
  storage?: Pick<Storage, 'getItem' | 'setItem'>,
): Place[] {
  const places = mergePlaces([place], readPlaces(storage)).slice(0, 20);
  try {
    (storage ?? globalThis.localStorage)?.setItem(
      CACHE_KEY,
      JSON.stringify(places),
    );
  } catch {
    /* Settings still work when storage is unavailable. */
  }
  return places;
}
export function parseCityResults(body: unknown): Place[] {
  if (!record(body) || body.error === true)
    throw new Error('City search returned an invalid response. Try again.');
  if (body.results === undefined) return [];
  if (!Array.isArray(body.results))
    throw new Error('City search returned an invalid response. Try again.');
  return body.results
    .filter(record)
    .filter(
      (r) =>
        typeof r.name === 'string' &&
        r.name.length > 0 &&
        typeof r.id === 'number' &&
        typeof r.timezone === 'string' &&
        r.timezone.length > 0 &&
        validCoordinates(r.latitude, r.longitude),
    )
    .map((r) => ({
      id: `geonames:${r.id}`,
      name: r.name as string,
      region: typeof r.admin1 === 'string' ? r.admin1 : '',
      country:
        typeof r.country === 'string'
          ? r.country
          : typeof r.country_code === 'string'
            ? r.country_code
            : '',
      latitude: r.latitude as number,
      longitude: r.longitude as number,
      timezone: r.timezone as string,
    }));
}
export async function searchCities(
  query: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
  language: string = 'en',
): Promise<Place[]> {
  const name = query.trim();
  if (name.length < 2) return [];
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.search = new URLSearchParams({
    name,
    count: '10',
    language,
    format: 'json',
  }).toString();
  const response = await fetcher(url, {
    signal,
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  });
  if (!response.ok)
    throw new Error(
      response.status === 429
        ? 'City search is busy. Try again shortly.'
        : 'City search is unavailable. Try again or use GPS.',
    );
  return parseCityResults(await response.json());
}
