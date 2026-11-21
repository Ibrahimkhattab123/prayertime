import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { calculateRange, initSync } from "../web/public/wasm/prayertime.js";
import { nextReminder, notificationFor, parseRegistration } from "./schedule.js";

initSync({
  module: readFileSync(new URL("../web/public/wasm/prayertime_bg.wasm", import.meta.url)),
});
const request = JSON.parse(readFileSync(new URL("../../examples/berlin.json", import.meta.url)));

test("schedules adjusted absolute times over a DST transition without a client", () => {
  const now = Date.parse("2026-03-28T23:30:00Z");
  const days = JSON.parse(
    calculateRange(
      JSON.stringify({ ...request, date: "2026-03-28", adjustments_minutes: { fajr: 13 } }),
      3,
    ),
  );
  const fajr = days[1].prayers.find((prayer) => prayer.name === "fajr");
  assert.equal(fajr.adjusted.offset_seconds, 7200);
  const configuration = { ...request, adjustments_minutes: { fajr: 13 } };
  const first = nextReminder(configuration, now, calculateRange);
  assert.deepEqual(first, { names: ["fajr"], time: Math.ceil(fajr.adjusted.unix_seconds * 1000) });
  assert.deepEqual(nextReminder(configuration, first.time, calculateRange).names, ["dhuhr"]);
});

test("groups simultaneous prayers, excludes sunrise and retries when no future time is available", () => {
  const now = Date.parse("2026-11-21T02:00:00Z");
  const adjusted = { unix_seconds: (now + 1000) / 1000 };
  const rows = [
    {
      prayers: [
        { name: "fajr", adjusted },
        { name: "dhuhr", adjusted },
        { name: "sunrise", adjusted },
      ],
    },
  ];
  assert.deepEqual(
    nextReminder(request, now, () => JSON.stringify(rows)),
    { time: now + 1000, names: ["fajr", "dhuhr"] },
  );
  assert.deepEqual(
    nextReminder(request, now, () => "[]"),
    { time: now + 21600000, names: [] },
  );
});

test("only accepts supported HTTPS browser push endpoints", () => {
  const make = (endpoint) => ({
    subscription: { endpoint, keys: { p256dh: "A".repeat(87), auth: "B".repeat(22) } },
    configuration: request,
    language: "de",
  });
  for (const endpoint of [
    "http://fcm.googleapis.com/fcm/send/test",
    "https://fcm.googleapis.com.evil.test/token",
    "https://8.8.8.8/token",
    "https://fcm.googleapis.com:444/token",
  ])
    assert.throws(() => parseRegistration(make(endpoint)));
  for (const endpoint of [
    "https://fcm.googleapis.com/fcm/send/test",
    "https://web.push.apple.com/token",
  ]) {
    assert.equal(parseRegistration(make(endpoint)).subscription.endpoint, endpoint);
  }
  assert.equal(notificationFor({ time: 123, names: ["fajr"] }, "de").title, "Gebetszeit · Fadschr");
});
