/** Boundary lookup stays on the device; the core handles all timezone rules/DST. */
export type TimezoneFinder = {
  get_tz_name: (longitude: number, latitude: number) => string;
  get_tz_names: (longitude: number, latitude: number) => unknown;
  data_version: () => string;
};
export type TimezoneMatch = {
  timezone: string;
  candidates: string[];
  dataVersion: string;
};
export function createTimezoneLookup(load: () => Promise<TimezoneFinder>) {
  let finder: Promise<TimezoneFinder> | undefined;
  return async (
    latitude: number,
    longitude: number,
  ): Promise<TimezoneMatch> => {
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180
    )
      throw new Error('Enter valid latitude and longitude coordinates.');
    finder ??= load().catch((e) => {
      finder = undefined;
      throw e;
    });
    const f = await finder;
    // tzf expects longitude first, unlike browser Geolocation.
    const timezone = f.get_tz_name(longitude, latitude);
    if (!timezone)
      throw new Error(
        'No timezone boundary was found here. Select a nearby city or set the timezone manually.',
      );
    const raw = f.get_tz_names(longitude, latitude);
    const candidates = [
      ...new Set([
        timezone,
        ...(Array.isArray(raw)
          ? raw.filter((v): v is string => typeof v === 'string' && !!v)
          : []),
      ]),
    ];
    return { timezone, candidates, dataVersion: f.data_version() };
  };
}
export const detectTimezone = createTimezoneLookup(async () => {
  const path = '/timezone/tzf.js';
  const m = await import(/* @vite-ignore */ path);
  await m.default({ module_or_path: '/timezone/tzf_wasm_bg.wasm' });
  return new m.WasmFinder() as TimezoneFinder;
});
