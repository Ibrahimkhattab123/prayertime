// Service-worker contract test; this is not a browser/offline UI test.
import vm from "node:vm";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
const root = resolve(import.meta.dirname, "../dist");
const source = await readFile(resolve(root, "sw.js"), "utf8");
const handlers = new Map();
const stores = new Map();
let online = true;
let claimed = false;
const messages = [];
const assetPath = (u) => resolve(root, u === "/" ? "index.html" : u.replace(/^\//, ""));
const fetchAsset = async (u) => {
  if (!online) throw new Error("offline");
  const path = typeof u === "string" ? u : new URL(u.url).pathname;
  return new Response(await readFile(assetPath(path)));
};
const caches = {
  async open(name) {
    if (!stores.has(name)) stores.set(name, new Map());
    const items = stores.get(name);
    return {
      async addAll(urls) {
        for (const u of urls) {
          await stat(assetPath(u));
          items.set(u, await fetchAsset(u));
        }
      },
      async match(u) {
        return items.get(typeof u === "string" ? u : new URL(u.url).pathname)?.clone();
      },
    };
  },
  async keys() {
    return [...stores.keys()];
  },
  async delete(key) {
    return stores.delete(key);
  },
};
const self = {
  location: { origin: "https://prayertime.test" },
  clients: {
    async claim() {
      claimed = true;
    },
    async matchAll() {
      return [{ postMessage: (m) => messages.push(m) }];
    },
  },
  async skipWaiting() {},
  addEventListener: (type, fn) => handlers.set(type, fn),
};
vm.runInNewContext(source, { self, caches, fetch: fetchAsset, URL, Response });
async function lifecycle(name) {
  let pending;
  handlers.get(name)({ waitUntil: (p) => (pending = p) });
  await pending;
}
await lifecycle("install");
await lifecycle("activate");
assert.equal(claimed, true);
assert.ok(messages.some((m) => m.type === "OFFLINE_READY"));
const stored = [...stores.values()][0];
assert.ok(stored.has("/wasm/prayertime.js"));
assert.ok(stored.has("/wasm/prayertime_bg.wasm"));
assert.ok(stored.has("/timezone/tzf.js"));
assert.ok(stored.has("/timezone/tzf_wasm_bg.wasm"));
assert.ok([...stored.keys()].some((k) => k.endsWith(".css")));
online = false;
async function request(path, mode = "same-origin") {
  let response;
  handlers.get("fetch")({
    request: { url: "https://prayertime.test" + path, method: "GET", mode },
    respondWith: (p) => (response = p),
  });
  return await response;
}
assert.match(await (await request("/", "navigate")).text(), /PrayerTime/);
assert.equal(
  (await (await request("/wasm/prayertime_bg.wasm")).arrayBuffer()).byteLength,
  (await readFile(assetPath("/wasm/prayertime_bg.wasm"))).byteLength,
);
for (const path of stored.keys()) {
  assert.ok(await request(path, path === "/" ? "navigate" : "same-origin"), path);
}
console.log(
  `Offline service-worker contract: ${stored.size} production assets cached and returned with network disabled.`,
);
