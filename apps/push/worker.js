import { DurableObject } from "cloudflare:workers";
import { buildPushPayload } from "@block65/webcrypto-web-push";
import wasm from "../web/public/wasm/prayertime_bg.wasm";
import { initSync, calculateRange } from "../web/public/wasm/prayertime.js";
import { nextReminder, notificationFor, parseRegistration } from "./schedule.js";

initSync({ module: wasm });
const grace = 5 * 60 * 1000;

export class PrayerReminders extends DurableObject {
  async register(registration, event) {
    const record = { ...registration, event, revision: crypto.randomUUID() };
    await this.ctx.storage.transaction(async (txn) => {
      await txn.put("registration", record);
      await txn.setAlarm(event.time);
    });
  }

  async remove() {
    await this.ctx.storage.transaction(async (txn) => {
      await txn.delete("registration");
      await txn.deleteAlarm();
    });
  }

  async send(subscription, message, ttl) {
    const payload = await buildPushPayload(
      { data: message, options: { ttl, urgency: "high" } },
      subscription,
      {
        subject: this.env.VAPID_SUBJECT,
        publicKey: this.env.VAPID_PUBLIC_KEY,
        privateKey: this.env.VAPID_PRIVATE_KEY,
      },
    );
    const response = await fetch(subscription.endpoint, {
      ...payload,
      redirect: "manual",
      signal: AbortSignal.timeout(10000),
    });
    await response.body?.cancel();
    return response.status;
  }

  async testNotification() {
    const now = Date.now();
    const result = await this.ctx.storage.transaction(async (txn) => {
      const record = await txn.get("registration");
      if (!record) return { status: 404 };
      const lastTest = await txn.get("lastTest");
      if (lastTest && now - lastTest < 60000) return { status: 429 };
      await txn.put("lastTest", now);
      return { record };
    });
    if (!result.record) return result;
    const { subscription, language } = result.record;
    const titles = {
      en: "PrayerTime test notification",
      de: "PrayerTime-Testbenachrichtigung",
      ar: "إشعار اختبار من PrayerTime",
    };
    const instruction = notificationFor({ time: now, names: [] }, language);
    try {
      const providerStatus = await this.send(
        subscription,
        { ...instruction, title: titles[language] },
        120,
      );
      if (providerStatus >= 200 && providerStatus < 300) return { status: 200 };
      if ([404, 410].includes(providerStatus)) return { status: 410 };
      return { status: 502, providerStatus };
    } catch {
      return { status: 502 };
    }
  }

  async alarm() {
    const record = await this.ctx.storage.get("registration");
    if (!record) return;
    const { event, subscription, language } = record;
    const now = Date.now();
    let discard = false;
    let retry = false;
    if (event.names.length && now - event.time < grace && event.time <= now) {
      try {
        const status = await this.send(
          subscription,
          notificationFor(event, language),
          Math.max(1, Math.ceil((event.time + grace - now) / 1000)),
        );
        discard = [404, 410].includes(status);
        retry = status === 429 || status >= 500;
        if (status >= 400 && !discard && !retry)
          console.warn("Push service rejected a prayer notification", status);
      } catch {
        retry = true;
      }
    }
    await this.ctx.storage.transaction(async (txn) => {
      const current = await txn.get("registration");
      if (current?.revision !== record.revision || current.event.time !== event.time) return;
      if (discard) {
        await txn.delete("registration");
        await txn.deleteAlarm();
        return;
      }
      if (event.time > now || (retry && now + 30000 < event.time + grace)) {
        await txn.setAlarm(Math.max(event.time, now + 30000));
        return;
      }
      const next = nextReminder(record.configuration, Math.max(now, event.time), calculateRange);
      await txn.put("registration", { ...current, event: next });
      await txn.setAlarm(next.time);
    });
  }
}

async function readBody(request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Missing registration");
  const bytes = new Uint8Array(12288);
  let offset = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (offset + value.length > bytes.length) throw new Error("Registration too large");
      bytes.set(value, offset);
      offset += value.length;
    }
    return JSON.parse(new TextDecoder().decode(bytes.subarray(0, offset)));
  } finally {
    await reader.cancel();
  }
}

export default {
  async fetch(request, env) {
    if (request.headers.get("Origin") !== env.APP_ORIGIN)
      return new Response(null, { status: 403 });
    const headers = {
      "Access-Control-Allow-Origin": env.APP_ORIGIN,
      "Access-Control-Allow-Methods": "GET, PUT, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Cache-Control": "no-store",
      Vary: "Origin",
    };
    const reply = (value, status = 200) => Response.json(value, { status, headers });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    const { pathname } = new URL(request.url);
    if (pathname === "/config" && request.method === "GET") {
      if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT)
        return reply({ error: "Unavailable" }, 503);
      return reply({ publicKey: env.VAPID_PUBLIC_KEY });
    }
    const isTest = pathname === "/subscription/test" && request.method === "POST";
    if (!isTest && (pathname !== "/subscription" || !["PUT", "DELETE"].includes(request.method)))
      return reply({ error: "Not found" }, 404);
    const capability = request.headers.get("Authorization")?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    if (!capability) return reply({ error: "Invalid registration key" }, 401);
    const { success } = await env.SUBSCRIPTION_LIMIT.limit({
      key: request.headers.get("CF-Connecting-IP") ?? capability,
    });
    if (!success) return reply({ error: "Too many requests" }, 429);
    const stub = env.REMINDERS.getByName(capability);
    if (isTest) {
      const { status, providerStatus } = await stub.testNotification();
      return reply({ accepted: status === 200, providerStatus }, status);
    }
    if (request.method === "DELETE") {
      await stub.remove();
      return new Response(null, { status: 204, headers });
    }
    let registration;
    let event;
    try {
      registration = parseRegistration(await readBody(request));
      event = nextReminder(registration.configuration, Date.now(), calculateRange);
    } catch {
      return reply({ error: "Invalid subscription or prayer settings" }, 400);
    }
    await stub.register(registration, event);
    return reply({ registered: true });
  },
};
