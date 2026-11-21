// Precache exact production assets. A changed build gets a different cache key.
import { readdir, readFile, writeFile, cp, mkdir, rm } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { createHash } from "node:crypto";
const root = resolve(import.meta.dirname, "../apps/web/dist/client");
async function walk(dir) {
  let out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = resolve(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (!p.endsWith(".map") && !p.endsWith("/sw.js")) out.push(p);
  }
  return out;
}
const files = (await walk(root)).sort();
const hash = createHash("sha256");
hash.update(await readFile(new URL(import.meta.url)));
for (const f of files) {
  hash.update(relative(root, f));
  hash.update(await readFile(f));
}
const version = hash.digest("hex").slice(0, 16);
const urls = ["/", ...files.map((f) => "/" + relative(root, f))];
const source = `const CACHE='prayertime-${version}';
const ASSETS=${JSON.stringify(urls)};
self.addEventListener('install',event=>{event.waitUntil((async()=>{const cache=await caches.open(CACHE);await cache.addAll(ASSETS);})());});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{for(const key of await caches.keys()){if(key.startsWith('prayertime-')&&key!==CACHE)await caches.delete(key);}await self.clients.claim();for(const client of await self.clients.matchAll())client.postMessage({type:'OFFLINE_READY'});})());});
self.addEventListener('message',event=>{
if(event.data?.type==='CHECK_READY')event.source?.postMessage({type:'OFFLINE_READY'});
if(event.data?.type==='ACTIVATE_UPDATE')event.waitUntil((async()=>{
  const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  if(clients.length>1){event.source?.postMessage({type:'UPDATE_BLOCKED'});return;}
  await self.skipWaiting();
})());
});
self.addEventListener('push',event=>{
let message;
try { message=event.data?.json(); } catch { return; }
if(typeof message?.title!=='string'||typeof message.body!=='string'||!/^prayer-[0-9]+$/.test(message.tag))return;
event.waitUntil(self.registration.showNotification(message.title,{
  body:message.body,tag:message.tag,icon:'/icons/icon-192.png',data:{type:'PRAYER_REMINDER'}
}));
});
self.addEventListener('notificationclick',event=>{
if(event.notification.data?.type!=='PRAYER_REMINDER')return;
event.notification.close();
event.waitUntil((async()=>{
  const url=new URL('/?adhan=1#prayer-reminders',self.location.origin).href;
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const client=windows.find(window=>new URL(window.url).origin===self.location.origin);
  if(client){
    const destination=await client.navigate(url).catch(()=>null);
    if(destination){await destination.focus();return;}
  }
  await self.clients.openWindow(url);
})());
});
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
if(event.request.mode==='navigate'){event.respondWith((async()=>{const cached=await (await caches.open(CACHE)).match('/');return cached??fetch(event.request);})());return;}
if(ASSETS.includes(url.pathname)){event.respondWith((async()=>{const cache=await caches.open(CACHE);return await cache.match(url.pathname)??fetch(event.request);})());}
});\n`;
await writeFile(resolve(root, "sw.js"), source);
// Stage the monorepo's static output for Sites and ordinary static hosting.
const destination = resolve(import.meta.dirname, "../dist");
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(root, destination, { recursive: true });
console.log(`Offline cache ${version}: ${urls.length} assets; static app staged in dist/`);
