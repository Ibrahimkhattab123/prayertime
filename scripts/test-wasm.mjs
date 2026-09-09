import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import init, {
  calculateDay,
  calculateRange,
  validateConfiguration,
  listProfiles,
  calculateSolarEvents,
} from "../apps/web/public/wasm/prayertime.js";
const root = resolve(import.meta.dirname, "..");
await init({
  module_or_path: await readFile(join(root, "apps/web/public/wasm/prayertime_bg.wasm")),
});
// No network APIs are used after initialization.
globalThis.fetch = () => {
  throw new Error("Unexpected network dependency");
};
const temp = await mkdtemp(join(tmpdir(), "prayertime-parity-"));
function compare(a, b, path = "result") {
  if (typeof a === "number" && typeof b === "number") {
    assert.ok(Math.abs(a - b) < 0.0001, `${path}: ${a} vs ${b}`);
    return;
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort(), path);
    for (const k of Object.keys(a)) compare(a[k], b[k], path + "." + k);
    return;
  }
  // UTC textual fractions may differ at a microsecond from platform libm.
  if (typeof a === "string" && typeof b === "string" && /\.(utc|local)$/.test(path)) {
    assert.equal(
      a.replace(/\.\d+(?=Z|[+-]\d\d:)/, ""),
      b.replace(/\.\d+(?=Z|[+-]\d\d:)/, ""),
      path,
    );
    return;
  }
  assert.deepEqual(a, b, path);
}
const cases = [
  ["2026-09-09", 52.52, 13.405, "Europe/Berlin"],
  ["2026-06-21", 52.52, 13.405, "Europe/Berlin"],
  ["2026-06-21", 69.6492, 18.9553, "Europe/Oslo"],
  ["2026-12-21", 69.6492, 18.9553, "Europe/Oslo"],
  ["2026-03-29", 52.52, 13.405, "Europe/Berlin"],
  ["2026-10-25", 52.52, 13.405, "Europe/Berlin"],
  ["2026-09-09", 1.8721, -157.4278, "Pacific/Kiritimati"],
  ["2026-04-10", 64, 0, "UTC"],
];
let count = 0;
try {
  for (const [date, lat, lon, timezone] of cases) {
    for (const calculation of ["calc.mwl@1", "calc.umm_al_qura@1"]) {
      const request = {
        date,
        location: { latitude_deg: lat, longitude_deg: lon },
        timezone,
        profiles: { calculation, fiqh: "fiqh.hanafi_abu_hanifa@1" },
        ramadan: false,
        high_latitude: "angle_based",
        adjustments_minutes: { maghrib: 10 },
      };
      const json = JSON.stringify(request);
      const path = join(temp, "request.json");
      await writeFile(path, json);
      const native = JSON.parse(
        execFileSync(join(root, "target/debug/prayertime"), ["calculate-day", "--request", path], {
          encoding: "utf8",
        }),
      );
      const wasm = JSON.parse(calculateDay(json));
      compare(native, wasm);
      count++;
      assert.equal(JSON.parse(validateConfiguration(json)).valid, true);
      assert.deepEqual(JSON.parse(calculateSolarEvents(json)), wasm.solar);
      assert.equal(JSON.parse(calculateRange(json, 2)).length, 2);
    }
  }
  assert.throws(() => calculateDay("{}"));
  assert.throws(() =>
    calculateRange(
      JSON.stringify({
        date: "2026-01-01",
        location: { latitude_deg: 0, longitude_deg: 0 },
        timezone: "UTC",
      }),
      367,
    ),
  );
  assert.equal(JSON.parse(listProfiles()).methods.length, 4);
  console.log(
    `Native/WASM parity: ${count} requests pass; all 5 bindings exercised; no network after initialization.`,
  );
} finally {
  await rm(temp, { recursive: true, force: true });
}
