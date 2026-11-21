const prayerNames = new Set(["fajr", "dhuhr", "asr", "maghrib", "isha"]);

function precedingDate(time, timezone) {
  const iso = new Intl.DateTimeFormat("sv-SE", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(time);
  const date = new Date(iso + "T12:00:00Z");
  if (!Number.isFinite(date.valueOf())) throw new Error("Invalid civil date");
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function nextReminder(configuration, now, calculateRange) {
  const date = precedingDate(now, configuration.timezone);
  const days = JSON.parse(
    calculateRange(
      JSON.stringify({
        ...configuration,
        date,
        window_profile: "none",
      }),
      4,
    ),
  );
  let time = Infinity;
  const names = new Set();
  for (const day of days) {
    for (const prayer of day.prayers) {
      const candidate = prayer.adjusted?.unix_seconds * 1000;
      if (
        !prayerNames.has(prayer.name) ||
        !Number.isFinite(candidate) ||
        candidate <= now ||
        candidate > time
      )
        continue;
      if (candidate < time) names.clear();
      time = candidate;
      names.add(prayer.name);
    }
  }
  return names.size
    ? { time: Math.ceil(time), names: [...names] }
    : { time: now + 6 * 60 * 60 * 1000, names: [] };
}

const pushDomains = new Set([
  "fcm.googleapis.com",
  "android.googleapis.com",
  "updates.push.services.mozilla.com",
  "web.push.apple.com",
  "push.apple.com",
]);
const base64url = /^[A-Za-z0-9_-]+$/;
export function parseRegistration(body) {
  const sub = body?.subscription;
  if (typeof sub?.endpoint !== "string" || sub.endpoint.length > 4096)
    throw new Error("Invalid push endpoint");
  const url = new URL(sub.endpoint);
  const knownHost =
    pushDomains.has(url.hostname) ||
    url.hostname.endsWith(".push.apple.com") ||
    url.hostname.endsWith(".notify.windows.com");
  if (
    !knownHost ||
    url.protocol !== "https:" ||
    url.port ||
    url.username ||
    url.password ||
    url.hash ||
    url.pathname === "/"
  )
    throw new Error("Unsupported push endpoint");
  const { p256dh, auth } = sub.keys ?? {};
  if (
    typeof p256dh !== "string" ||
    p256dh.length !== 87 ||
    !base64url.test(p256dh) ||
    typeof auth !== "string" ||
    auth.length !== 22 ||
    !base64url.test(auth)
  )
    throw new Error("Invalid subscription keys");
  const r = body.configuration;
  if (!r || typeof r.timezone !== "string" || r.timezone.length > 100)
    throw new Error("Invalid prayer settings");
  return {
    subscription: {
      endpoint: url.href,
      expirationTime: sub.expirationTime ?? null,
      keys: { p256dh, auth },
    },
    configuration: {
      timezone: r.timezone,
      location: r.location,
      profiles: r.profiles,
      high_latitude: r.high_latitude,
      rounding: r.rounding,
      ramadan: r.ramadan,
      adjustments_minutes: r.adjustments_minutes,
    },
    language: ["ar", "de"].includes(body.language) ? body.language : "en",
  };
}

const messages = {
  en: [
    "Prayer time",
    "Open PrayerTime to play the Adhan.",
    "Fajr",
    "Dhuhr",
    "Asr",
    "Maghrib",
    "Isha",
  ],
  de: [
    "Gebetszeit",
    "PrayerTime öffnen und den Azan abspielen.",
    "Fadschr",
    "Dhuhr",
    "Asr",
    "Maghrib",
    "Ischa",
  ],
  ar: [
    "حان وقت الصلاة",
    "افتح PrayerTime لتشغيل الأذان.",
    "الفجر",
    "الظهر",
    "العصر",
    "المغرب",
    "العشاء",
  ],
};

export function notificationFor(event, language) {
  const [title, body, ...labels] = messages[language];
  const localized = event.names.map((name) => labels[[...prayerNames].indexOf(name)]);
  return { title: title + " · " + localized.join(" / "), body, tag: "prayer-" + event.time };
}
