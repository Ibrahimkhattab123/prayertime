import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import init, { calculateDay, civilDayBounds, solarPosition } from '../apps/web/public/wasm/prayertime.js';
import {
  asrShadowThreshold, createSolarDay, ground, horizon, solarLighting, objectHeight, projectShadow, projectSun,
  selectedSolarTime, shadowLength, shadowVector, sunIsVisible, timeTravelKey, timeTravelSlider, timeTravelUnix, trajectory,
} from '../apps/web/lib/solar.ts';

await init({ module_or_path: await readFile(new URL('../apps/web/public/wasm/prayertime_bg.wasm', import.meta.url)) });
const engine = { civilDayBounds, solarPosition };
const request = {
  date: '2026-09-22',
  timezone: 'Europe/Berlin',
  location: { latitude_deg: 52.52, longitude_deg: 13.405 },
  profiles: { calculation: 'calc.mwl@1', fiqh: 'fiqh.shafii@1' },
};
const result = (patch) => JSON.parse(calculateDay(JSON.stringify({ ...request, ...patch })));
const local = (zone, seconds) => new Intl.DateTimeFormat('en-GB', {
  timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'shortOffset',
}).format(seconds * 1000);
const close = (a, b, tolerance = 0.0001) => assert.ok(Math.abs(a - b) < tolerance, `${a} ≠ ${b}`);

const berlinResult = result();
const berlin = createSolarDay(berlinResult, engine);
assert.equal(berlin.sunrise, berlinResult.solar.sunrise.unix_seconds);
assert.equal(berlin.transit, berlinResult.solar.solar_transit.unix_seconds);
assert.equal(berlin.sunset, berlinResult.solar.sunset.unix_seconds);
assert.equal(berlin.end - berlin.start, 86400);
const sunrise = berlin.sunrise;
const noon = berlin.transit;
const sunset = berlin.sunset;
assert.notEqual(berlinResult.solar_local.solar_transit.clock, '12:00');
assert.ok(sunrise < noon && noon < sunset);
close(berlin.position(sunrise).altitude, horizon);
close(berlin.position(sunset).altitude, horizon);
close(berlin.position(noon).azimuth, 180, 0.01);
const beforeNoon = berlin.position(noon - 7200);
const afterNoon = berlin.position(noon + 7200);
const noonPosition = berlin.position(noon);
assert.ok(beforeNoon.azimuth < 180 && afterNoon.azimuth > 180);
assert.ok(noonPosition.altitude > beforeNoon.altitude && noonPosition.altitude > afterNoon.altitude);
assert.ok(projectSun(beforeNoon).x < projectSun(noonPosition).x);
assert.ok(projectSun(afterNoon).x > projectSun(noonPosition).x);
assert.ok(projectSun(noonPosition).y < projectSun(beforeNoon).y);
assert.ok(shadowVector(beforeNoon).x > 0 && shadowVector(afterNoon).x < 0);
assert.ok(!sunIsVisible(berlin.position(sunrise - 60).altitude));
assert.ok(sunIsVisible(berlin.position(sunrise + 60).altitude));
assert.ok(berlin.position(sunset - 60).altitude > horizon);
assert.ok(berlin.position(sunset + 60).altitude < horizon);
assert.ok(shadowLength(berlin.position(sunrise + 420).altitude) > shadowLength(noonPosition.altitude));
assert.ok(shadowLength(berlin.position(sunset - 420).altitude) > shadowLength(noonPosition.altitude));
assert.equal(projectShadow(berlin.position(berlin.start)), null);
assert.equal(timeTravelKey(720, 'ArrowRight'), 725);
assert.equal(timeTravelKey(720, 'Home'), 0);
assert.equal(timeTravelKey(720, 'End'), 1440);
assert.equal(timeTravelKey(720, 'Tab'), null);
close(timeTravelUnix(berlin, timeTravelSlider(berlin, noon)), noon);
assert.equal(selectedSolarTime(berlin, noon, true, null), noon);
assert.equal(selectedSolarTime(berlin, noon + 5.125, true, null), noon + 5.125);
assert.notDeepEqual(projectSun(berlin.position(noon)), projectSun(berlin.position(noon + 5.125)));
assert.equal(selectedSolarTime(berlin, noon, false, 120), berlin.start + 7200);
assert.equal(selectedSolarTime(berlin, noon + 10, false, 120), berlin.start + 7200);
assert.equal(selectedSolarTime(berlin, noon + 3600, false, null), noon);
assert.ok(trajectory(berlin).startsWith('M'));
close(shadowLength(45), objectHeight);
assert.equal(shadowLength(0), null);
const sun = projectSun(beforeNoon);
const shadow = projectShadow(beforeNoon);
assert.ok((sun.x - ground.x) * shadow.x < 0);
assert.ok(Math.hypot(projectShadow({ altitude: 0.001, azimuth: 90 }).x,
  projectShadow({ altitude: 0.001, azimuth: 90 }).y) <= ground.radius);

for (const [factor, fiqh] of [[1, 'fiqh.shafii@1'], [2, 'fiqh.hanafi_abu_hanifa@1']]) {
  const day = result({ profiles: { ...request.profiles, fiqh } });
  const asr = day.prayers.find((p) => p.name === 'asr');
  const position = berlin.position(asr.raw.unix_seconds);
  const threshold = asrShadowThreshold(asr);
  close(threshold, shadowLength(position.altitude), 0.0001);
  close(threshold, shadowLength(noonPosition.altitude) + factor * objectHeight, 0.01);
}
const summer = createSolarDay(result({ date: '2026-06-21' }), engine);
assert.ok(summer.position(summer.transit).altitude > noonPosition.altitude + 20);
assert.ok(summer.sunrise - summer.start < berlin.sunrise - berlin.start);
const sydney = createSolarDay(result({
  timezone: 'Australia/Sydney',
  location: { latitude_deg: -33.87, longitude_deg: 151.21 },
}), engine);
const sydneyNoon = sydney.position(sydney.transit);
assert.ok(sydneyNoon.azimuth < 0.01 || sydneyNoon.azimuth > 359.99);
assert.ok(shadowVector(sydneyNoon).y < 0);
assert.ok(shadowVector(noonPosition).y > 0);
assert.notEqual(timeTravelUnix(sydney, 720), timeTravelUnix(berlin, 720));

const spring = createSolarDay(result({ date: '2026-03-29' }), engine);
const autumn = createSolarDay(result({ date: '2026-10-25' }), engine);
assert.equal(spring.end - spring.start, 23 * 3600);
assert.equal(autumn.end - autumn.start, 25 * 3600);
for (const day of [spring, autumn]) {
  assert.equal(timeTravelUnix(day, 0), day.start);
  assert.equal(timeTravelUnix(day, 1440), day.end);
}
assert.equal(local(request.timezone, spring.start + 2 * 3600), '03:00 GMT+2');
assert.equal(local(request.timezone, autumn.start + 2 * 3600), '02:00 GMT+2');
assert.equal(local(request.timezone, autumn.start + 3 * 3600), '02:00 GMT+1');

const tromso = (date) => createSolarDay(result({
  date,
  timezone: 'Europe/Oslo',
  location: { latitude_deg: 69.65, longitude_deg: 18.96 },
}), engine);
const polarDay = tromso('2026-06-21');
const polarNight = tromso('2026-12-21');
for (const day of [polarDay, polarNight]) {
  assert.equal(day.sunrise, null);
  assert.equal(day.sunset, null);
}
assert.ok(trajectory(polarDay).length > 0);
assert.equal(trajectory(polarNight), '');
assert.ok(polarDay.position(polarDay.start).altitude > 0);
assert.equal(projectShadow(polarNight.position(polarNight.transit)), null);

console.log('Solar checks passed: crossings, transit, azimuth, shadow, Asr, date, location, DST and polar days.');

// November afternoon in Munich must still read as daytime.
const munich = createSolarDay(result({
  date: '2026-11-21',
  location: { latitude_deg: 48.1374, longitude_deg: 11.5755 },
}), engine);
const afternoon = Date.parse('2026-11-21T14:41:00+01:00') / 1000;
const position = munich.position(afternoon);
const light = solarLighting(position.altitude, afternoon - munich.transit);
assert.ok(light.daylight > 0.75);
assert.ok(light.evening > 0.9);
assert.equal(light.stars, 0);
assert.equal(solarLighting(-18, -20000).daylight, 0);
assert.equal(solarLighting(-18, 20000).stars, 1);
assert.ok(solarLighting(0, -12000).warmth > 0.8);
assert.ok(solarLighting(0, -12000).evening < solarLighting(0, 12000).evening);
const projected = projectSun(position);
const groundShadow = projectShadow(position);
assert.ok(projected.x > ground.x && groundShadow.x < 0);
const azimuth = position.azimuth * Math.PI / 180;
const shadowX = groundShadow.x;
const shadowNorth = groundShadow.y / ground.tilt;
const shadowMagnitude = Math.hypot(shadowX, shadowNorth);
close(shadowX / shadowMagnitude, Math.sin(azimuth));
close(shadowNorth / shadowMagnitude, -Math.cos(azimuth));
console.log(`Munich at 14:41: altitude ${position.altitude.toFixed(1)}°, azimuth ${position.azimuth.toFixed(1)}°, shadow ${shadowLength(position.altitude).toFixed(1)} m.`);
