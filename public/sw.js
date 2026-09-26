/* Firepoint offline fallback. No official notices, API responses, routes, map tiles, or live data are cached.
   The homepage shell (map + directions) and its static assets are cached (network-first) so the bundled,
   unverified shelter list and straight-line directions still open offline. */
const CACHE = "firepoint-shell-v3";
const ASSETS = "firepoint-assets-v3";
const SHELL = ["/offline.html", "/icon-192.png", "/icon-512.png"];
const MAX_ASSETS = 120;

/** Cache the homepage and the static files its HTML references, so it can open offline after one visit. */
async function precacheHome() {
  const response = await fetch("/", { cache: "no-store" });
  if (!response.ok) return;
  await (await caches.open(CACHE)).put("/", response.clone());
  const html = await response.text();
  const assets = [...new Set(html.match(/\/_next\/static\/[^"'\s)\\]+/g) || [])];
  const cache = await caches.open(ASSETS);
  await Promise.all(assets.map((url) => cache.add(url).catch(() => undefined)));
}

async function trim(cache) {
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_ASSETS)).map((key) => cache.delete(key)));
}

async function networkFirst(request, cacheName, cacheKey) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      await cache.put(cacheKey || request, response.clone());
      if (cacheName === ASSETS) trim(cache);
    }
    return response;
  } catch (error) {
    const cached = await caches.match(cacheKey || request);
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE)
    .then((cache) => cache.addAll(SHELL))
    .then(() => precacheHome().catch(() => undefined))
    .then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((names) => Promise.all(names
      .filter((name) => name.startsWith("firepoint-") && name !== CACHE && name !== ASSETS)
      .map((name) => caches.delete(name)))),
    self.clients.claim(),
  ]));
});
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(networkFirst(event.request, ASSETS));
    return;
  }
  if (event.request.mode !== "navigate") return;
  if (url.pathname === "/") {
    event.respondWith(networkFirst(event.request, CACHE, "/")
      .catch(async () => (await caches.match("/offline.html")) || Response.error()));
    return;
  }
  event.respondWith(fetch(event.request).catch(async () => (await caches.match("/offline.html")) || Response.error()));
});
