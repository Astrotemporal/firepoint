/* Firepoint offline fallback. No official notices, API responses, routes, map tiles, or live data are cached.
   The homepage shell and its static assets are cached (network-first) so the page opens offline. Only the
   public no-data screen is ever cached as "/": a same-origin, non-redirected 200 whose HTML carries the
   public-shell marker. Any other homepage (the developer routing prototype, a login redirect, an error page)
   is never stored, and an offline "/" with nothing cached falls back to /offline.html.

   Cache namespaces are versioned. Bumping them makes the next successful update of this worker (install +
   activate) delete every older "firepoint-*" cache, including a homepage cached by the pre-gate prototype
   worker. That purge runs on the device only after it has reached the site online once and fetched this
   file; a device that has not reconnected keeps whatever its old worker cached, and nothing here can reach
   it remotely. */
const CACHE = "firepoint-shell-v6"; // v5 and earlier may hold ev-shell-static public card; v6 gets ev-pub-sheet drawer
const ASSETS = "firepoint-assets-v4";
const SHELL = ["/offline.html", "/icon-192.png", "/icon-512.png"];
const MAX_ASSETS = 120;
/** Class the public homepage's <main> carries (src/components/public-map-screen.tsx). */
const PUBLIC_SHELL_MARKER = "ev-pub-sheet";

/** Only a direct, same-origin 200 for the public screen may be stored as the homepage. */
async function publicHomeResponse(response) {
  if (!response.ok || response.redirected || response.type === "opaque" || response.type === "opaqueredirect") return null;
  if (new URL(response.url || self.location.origin, self.location.origin).origin !== self.location.origin) return null;
  const html = await response.clone().text();
  return html.includes(PUBLIC_SHELL_MARKER) ? html : null;
}

/** Cache the homepage and the static files its HTML references, so it can open offline after one visit. */
async function precacheHome() {
  const response = await fetch("/", { cache: "no-store" });
  const html = await publicHomeResponse(response);
  if (html === null) return;
  await (await caches.open(CACHE)).put("/", response.clone());
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
    const storable = cacheKey === "/" ? (await publicHomeResponse(response)) !== null : response.ok;
    if (storable) {
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

/** Every older firepoint-* cache goes, including a homepage stored by the pre-gate prototype worker. */
async function purgeOldCaches() {
  const names = await caches.keys();
  await Promise.all(names
    .filter((name) => name.startsWith("firepoint-") && name !== CACHE && name !== ASSETS)
    .map((name) => caches.delete(name)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE)
    .then((cache) => cache.addAll(SHELL))
    .then(() => precacheHome().catch(() => undefined))
    .then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(Promise.all([purgeOldCaches(), self.clients.claim()]));
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
