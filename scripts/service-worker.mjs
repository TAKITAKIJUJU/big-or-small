import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`],
  );
}
const files = walk("dist").filter((p) => !p.endsWith("/sw.js")),
  urls = files.map((p) => (p === "dist/index.html" ? "/" : "/" + p.slice(5))),
  version = createHash("sha256")
    .update("offline-v3")
    .update(files.map((p) => readFileSync(p)).join(""))
    .digest("hex")
    .slice(0, 16);
writeFileSync(
  "dist/sw.js",
  `const CACHE='handkerchief-${version}';const URLS=${JSON.stringify(urls)};
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(URLS.map(u=>new Request(u,{cache:'reload'}))))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('handkerchief-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;e.respondWith(caches.open(CACHE).then(async c=>{if(e.request.mode==='navigate')return (await c.match('/',{ignoreVary:true}))||fetch(e.request);return (await c.match(e.request,{ignoreVary:true}))||fetch(e.request);}));});
`,
);
console.log(`Offline cache: ${urls.length} files; ${version}`);
