import assert from "node:assert/strict";
import { sameRequest, nextPrayer } from "../apps/web/lib/view-model.ts";
const a = {
  date: "2026-09-09",
  timezone: "Europe/Berlin",
  location: { latitude_deg: 52.52, longitude_deg: 13.405 },
  profiles: { fiqh: "fiqh.shafii@1", calculation: "calc.mwl@1" },
  ramadan: null,
  adjustments_minutes: {},
  rounding: "nearest_minute",
  high_latitude: "none",
};
const b = Object.fromEntries(Object.entries(a).reverse());
b.location = { longitude_deg: 13.405, latitude_deg: 52.52 };
assert.equal(sameRequest(a, b), true);
assert.equal(sameRequest(a, { ...b, date: "2026-09-10" }), false);
const prayers = [
  { name: "dhuhr", adjusted: { unix_seconds: 200 } },
  { name: "asr", adjusted: { unix_seconds: 150 } },
  { name: "isha", adjusted: null },
];
assert.equal(nextPrayer(prayers, 100).name, "asr");
assert.equal(nextPrayer(prayers, 160).name, "dhuhr");
assert.equal(nextPrayer(prayers, 210), null);
assert.equal(prayers[0].name, "dhuhr");
console.log(
  "View-model regressions: request property order, changed settings, tuned next-prayer order and unavailable events pass.",
);

assert.equal(sameRequest({ window_profile: undefined }, { window_profile: "none" }), true);
assert.equal(sameRequest({ window_profile: "none" }, { window_profile: "shafii_draft" }), false);
