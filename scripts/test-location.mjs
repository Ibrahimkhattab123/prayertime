import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  searchCities,
  parseCityResults,
  filterPlaces,
  mergePlaces,
  placeLabel,
  starterPlaces,
  rememberPlace,
  readPlaces,
} from "../apps/web/lib/location.ts";
import { createTimezoneLookup } from "../apps/web/lib/timezone.ts";
import init, { WasmFinder } from "../apps/web/public/timezone/tzf.js";
import coreInit, { calculateDay } from "../apps/web/public/wasm/prayertime.js";

const result = {
  results: [
    {
      id: 2911298,
      name: "Hamburg",
      admin1: "Hamburg",
      country: "Germany",
      latitude: 53.55073,
      longitude: 9.99302,
      timezone: "Europe/Berlin",
    },
    {
      id: 5119842,
      name: "Hamburg",
      admin1: "New York",
      country: "United States",
      latitude: 42.71589,
      longitude: -78.82948,
      timezone: "America/New_York",
    },
  ],
};
const cities = parseCityResults(result);
assert.equal(cities.length, 2);
assert.notEqual(placeLabel(cities[0]), placeLabel(cities[1]));
assert.equal(cities[1].timezone, "America/New_York");
assert.deepEqual(parseCityResults({}), []);
assert.throws(() => parseCityResults({ error: true }));
assert.throws(() => parseCityResults({ results: "bad" }));
assert.deepEqual(
  parseCityResults({
    results: [
      { ...result.results[0], latitude: 91 },
      { ...result.results[0], timezone: undefined },
    ],
  }),
  [],
);
assert.equal(filterPlaces(starterPlaces, "tromso")[0].name, "Tromsø");
const berlin = {
  ...starterPlaces[0],
  id: "geonames:2950159",
  latitude: 52.52437,
  longitude: 13.41053,
};
assert.deepEqual(
  mergePlaces([berlin], starterPlaces).filter((p) => p.name === "Berlin"),
  [berlin],
);
assert.equal(mergePlaces(cities).length, 2);
const store = new Map();
const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
rememberPlace(cities[0], storage);
rememberPlace(cities[1], storage);
rememberPlace(cities[0], storage);
assert.equal(readPlaces(storage).length, 2);
assert.equal(readPlaces(storage)[0].id, cities[0].id);
assert.equal(filterPlaces(readPlaces(storage), "Hamburg, Germany")[0].timezone, "Europe/Berlin");
assert.deepEqual(readPlaces({ getItem: () => "{bad" }), []);
assert.deepEqual(readPlaces({ getItem: () => '{"bad":true}' }), []);
assert.doesNotThrow(() =>
  rememberPlace(cities[0], {
    getItem: () => {
      throw Error("disabled");
    },
    setItem: () => {
      throw Error("disabled");
    },
  }),
);
let calls = 0;
const controller = new AbortController();
const found = await searchCities("Hamburg, Germany", controller.signal, async (url, options) => {
  calls++;
  assert.equal(url.origin, "https://geocoding-api.open-meteo.com");
  assert.equal(url.searchParams.get("name"), "Hamburg, Germany");
  assert.equal(options.credentials, "omit");
  assert.equal(options.signal, controller.signal);
  assert.ok(!url.searchParams.has("latitude"));
  return new Response(JSON.stringify(result));
});
assert.deepEqual(found, cities);
assert.equal(
  (
    await searchCities("x", controller.signal, async () => {
      throw Error("should not request");
    })
  ).length,
  0,
);
assert.equal(calls, 1);
await assert.rejects(
  searchCities("Hamburg", controller.signal, async () => new Response("", { status: 429 })),
  /busy/,
);
await assert.rejects(
  searchCities("Hamburg", controller.signal, async () => new Response("", { status: 500 })),
  /unavailable/,
);
const aborted = new AbortController();
aborted.abort();
await assert.rejects(
  searchCities("Hamburg", aborted.signal, async (_, options) => {
    options.signal.throwIfAborted();
  }),
  { name: "AbortError" },
);

await init({
  module_or_path: await readFile(
    new URL("../apps/web/public/timezone/tzf_wasm_bg.wasm", import.meta.url),
  ),
});
await coreInit({
  module_or_path: await readFile(
    new URL("../apps/web/public/wasm/prayertime_bg.wasm", import.meta.url),
  ),
});
// All coordinate-to-zone and prayer calculations below run with networking disabled.
globalThis.fetch = () => {
  throw Error("Unexpected coordinate transmission");
};
let loads = 0;
const finder = new WasmFinder();
const lookup = createTimezoneLookup(async () => {
  loads++;
  return finder;
});
const cases = [
  ["Hamburg", 53.55073, 9.99302, "Europe/Berlin"],
  ["New York", 40.7128, -74.006, "America/New_York"],
  ["Kathmandu", 27.7172, 85.324, "Asia/Kathmandu"],
  ["Adelaide", -34.9285, 138.6007, "Australia/Adelaide"],
  ["Makkah", 21.4225, 39.8262, "Asia/Riyadh"],
  ["Kiritimati", 1.8721, -157.4278, "Pacific/Kiritimati"],
  ["Tromsø", 69.6492, 18.9553, "Europe/Oslo"],
];
for (const [name, latitude, longitude, expected] of cases) {
  const match = await lookup(latitude, longitude);
  assert.equal(match.timezone, expected, name);
  assert.ok(match.candidates.includes(expected));
  assert.ok(match.dataVersion);
  const day = JSON.parse(
    calculateDay(
      JSON.stringify({
        date: "2026-09-09",
        location: { latitude_deg: latitude, longitude_deg: longitude },
        timezone: match.timezone,
      }),
    ),
  );
  assert.equal(day.prayers[1].raw.date, "2026-09-09");
}
assert.equal(loads, 1);
await assert.rejects(lookup(NaN, 0), /valid latitude/);
await assert.rejects(lookup(91, 0), /valid latitude/);
assert.equal(loads, 1);
let tries = 0;
const retry = createTimezoneLookup(async () => {
  if (++tries === 1) throw Error("temporary loading error");
  return finder;
});
await assert.rejects(retry(52.52, 13.405), /temporary/);
assert.equal((await retry(52.52, 13.405)).timezone, "Europe/Berlin");
await assert.rejects(
  createTimezoneLookup(async () => ({
    get_tz_name: () => "",
    get_tz_names: () => [],
    data_version: () => "",
  }))(0, 0),
  /No timezone/,
);
const overlap = await createTimezoneLookup(async () => ({
  get_tz_name: () => "Europe/Berlin",
  get_tz_names: () => ["Europe/Berlin", "Europe/Paris"],
  data_version: () => "test",
}))(50, 6);
assert.deepEqual(overlap.candidates, ["Europe/Berlin", "Europe/Paris"]);
finder.free();
console.log(
  `Location checks pass: city disambiguation, auto timezone data, empty/error/aborted searches, offline saved cities, seven offline boundary lookups + Rust calculations, invalid coordinates and retry.`,
);
