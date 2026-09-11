import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import init, { calculateDay } from "../apps/web/public/wasm/prayertime.js";
import { calculationExplanation } from "../apps/web/lib/explanations.ts";
import { hijriDateLabel } from "../apps/web/lib/hijri.ts";
await init({
  module_or_path: await readFile(
    new URL("../apps/web/public/wasm/prayertime_bg.wasm", import.meta.url),
  ),
});
const request = {
  date: "2026-09-11",
  location: { latitude_deg: 30.0444, longitude_deg: 31.2357 },
  timezone: "Africa/Cairo",
};
const day = JSON.parse(calculateDay(JSON.stringify(request)));
const text = (p, d = day) =>
  calculationExplanation(p, d)
    .flatMap((s) => s.paragraphs)
    .join(" ");
assert.match(text(day.prayers[0]), /18°/);
assert.match(text(day.prayers[1]), /12 − longitude/);
assert.match(text(day.prayers[2]), /Shafi‘i, Maliki and Hanbali/);
assert.match(text(day.prayers[3]), /−0.833°/);
for (const prayer of day.prayers) {
  assert.match(text(prayer), /Africa\/Cairo/);
  assert.doesNotMatch(text(prayer), /undefined|NaN/);
}
for (const id of ["calc.qatar@1", "calc.umm_al_qura@1"]) {
  const d = JSON.parse(
    calculateDay(
      JSON.stringify({
        ...request,
        profiles: { calculation: id, fiqh: "fiqh.shafii@1" },
        ramadan: true,
      }),
    ),
  );
  assert.match(
    text(d.prayers[4], d),
    new RegExp(id.includes("qatar") ? "90 minutes" : "120 minutes"),
  );
  assert.match(text(d.prayers[4], d), /raw sunset instant/);
}
const estimated = JSON.parse(
  calculateDay(
    JSON.stringify({
      ...request,
      date: "2026-06-21",
      location: { latitude_deg: 52.52, longitude_deg: 13.405 },
      timezone: "Europe/Berlin",
      high_latitude: "one_seventh",
    }),
  ),
);
assert.match(text(estimated.prayers[0], estimated), /Estimated Fajr = sunrise −/);
assert.match(text(estimated.prayers[4], estimated), /Estimated Isha = sunset \+/);
const polar = JSON.parse(
  calculateDay(
    JSON.stringify({
      ...request,
      date: "2026-06-21",
      location: { latitude_deg: 69.65, longitude_deg: 18.96 },
      timezone: "Europe/Oslo",
    }),
  ),
);
assert.match(text(polar.prayers[0], polar), /no applicable estimate/);
for (const tz of ["UTC", "Pacific/Kiritimati", "America/Los_Angeles"]) {
  process.env.TZ = tz;
  assert.match(hijriDateLabel("2024-03-11"), /^1 Ramadan 1445 AH$/);
  assert.match(hijriDateLabel("2024-04-10"), /^1 Shawwal 1445 AH$/);
}
assert.equal(hijriDateLabel("not-a-date"), "Hijri date unavailable");
console.log(
  "Explanation and Hijri checks pass: actual rules, fixed intervals, estimates, unavailable events, month transitions and timezone-independent civil-date display.",
);
