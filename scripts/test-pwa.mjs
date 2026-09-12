import assert from "node:assert/strict";
import { watchPwa, isAppleMobile, isStandalone } from "../apps/web/lib/pwa.ts";
assert.ok(isAppleMobile("iPhone", "iPhone", 5));
assert.ok(isAppleMobile("Macintosh", "MacIntel", 5));
assert.equal(isAppleMobile("Macintosh", "MacIntel", 0), false);
assert.ok(isStandalone(false, true));
assert.equal(isStandalone(false, false), false);
const worker = () =>
  Object.assign(new EventTarget(), {
    messages: [],
    postMessage(m) {
      this.messages.push(m);
    },
  });
const sw = new EventTarget();
const doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
const active = worker();
const waiting = worker();
const reg = Object.assign(new EventTarget(), {
  active,
  waiting: null,
  installing: null,
  updates: 0,
  async update() {
    this.updates++;
  },
});
sw.controller = null;
sw.register = async (path, options) => {
  assert.equal(path, "/sw.js");
  assert.equal(options.updateViaCache, "none");
  return reg;
};
const counts = { ready: 0, blocked: 0, reload: 0, error: 0, update: 0 };
const callbacks = Object.fromEntries(Object.keys(counts).map((k) => [k, () => counts[k]++]));
const stop = watchPwa(sw, doc, callbacks);
await new Promise((resolve) => setImmediate(resolve));
assert.equal(counts.update, 0);
sw.controller = active;
sw.dispatchEvent(new Event("controllerchange"));
assert.equal(counts.reload, 0, "first installation must not reload");
assert.equal(active.messages.at(-1).type, "CHECK_READY");
sw.dispatchEvent(new MessageEvent("message", { data: { type: "OFFLINE_READY" } }));
assert.equal(counts.ready, 1);
reg.installing = waiting;
waiting.state = "installing";
reg.dispatchEvent(new Event("updatefound"));
reg.waiting = waiting;
waiting.state = "installed";
waiting.dispatchEvent(new Event("statechange"));
assert.equal(counts.update, 1);
assert.equal(waiting.messages.length, 0, "update discovery must not activate");
sw.dispatchEvent(new MessageEvent("message", { data: { type: "UPDATE_BLOCKED" } }));
assert.equal(counts.blocked, 1);
doc.dispatchEvent(new Event("visibilitychange"));
doc.dispatchEvent(new Event("visibilitychange"));
assert.equal(reg.updates, 1, "foreground checks are throttled");
sw.dispatchEvent(new Event("controllerchange"));
assert.equal(counts.reload, 1);
stop();
sw.dispatchEvent(new Event("controllerchange"));
assert.equal(counts.reload, 1, "cleanup removes listeners");
sw.register = async () => {
  throw new Error("offline");
};
const stopError = watchPwa(sw, doc, callbacks);
await new Promise((resolve) => setImmediate(resolve));
assert.equal(counts.error, 1);
stopError();
console.log(
  "PWA lifecycle: first install, waiting update, multi-window response, foreground check, cleanup and registration failure pass.",
);
