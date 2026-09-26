# Firepoint

Firepoint is a planned, account-optional mobile web app for emergency awareness and personal preparedness in Glendale, California. Nearby Southern California coverage is a future possibility **only where source coverage and rights have been checked**. A resident should be able to choose an area, find clearly attributed hazard information and links to agency notices, and keep a personal preparation checklist. The area-specific, source-backed parts of this plan are **proposed, not shipped**; see the current status below.

**Live-source release gate:** NWS, fire/air and Glendale GIS adapters exist, but the production source panel and POST queries are paused pending rights, caching, rate limits and monitoring. The local-only `FIREPOINT_DEMO_LIVE_SOURCES=enabled` switch is for developer integration tests, not a public coverage claim. The map and official agency links are separate.

**Not an official City of Glendale service.** Firepoint does not issue evacuation orders, determine whether a place is safe, or provide an all-clear. For an emergency, follow the responsible public agency and local emergency services. Do not rely on this app as your only source of information.

## App preview

[Current mobile Mapbox home](docs/preview/map-mobile.png) · [Desktop map](docs/preview/map-desktop.png) · [Official links and paused-check mobile page](docs/preview/prepare-mobile.png). These were captured from real app code and a real public Mapbox token, with **no live source queries or private marks**. The flame toolbar is for private marks, **not** verified fires; its icon/wording is under review. The map images are snapshots, not a forecast or an automatically refreshed live feed.

[The preview workflow](.github/workflows/preview.yml) captures `/prepare` desktop and mobile screenshots as **downloadable CI artifacts** for PRs and `main` pushes. Checked-in [desktop](docs/preview/desktop.png) and [mobile](docs/preview/mobile.png) PNGs may lag; the workflow no longer pushes bot commits to `main`. It does not load the Mapbox home or query live sources. The Mapbox home requires internet and a browser-publishable, URL-restricted token.

## What exists now

This repository began as a Next.js 16 starter and is under active development. The **`/` homepage is a full-screen Mapbox map** when a public `NEXT_PUBLIC_MAPBOX_TOKEN` is configured. It loads online without a tap and has a dark/light toggle and user-placed private flame marks; the marks are **not** confirmed incidents, and the map has no official zone, order, fire perimeter or safe-route overlay. A drawer computes a route to an unverified shelter automatically and offers an **escape route only after a tap**, but its targets and routes are not verified emergency guidance. **No live fire feed is connected; there is no default simulated fire; private mark halos do not affect routing.** See [Routes & shelters](#routes--shelters-location--routing). `/map` redirects to the homepage. Map tiles are not cached offline; the homepage shell can open after a prior online visit but does not deliver live alerts or verified routes offline. `/prepare` is a read-only, magazine-style wildfire guide adapted from the LA County Fire Department's [Ready! Set! Go! plan](https://fire.lacounty.gov/rsg/), with California's standard evacuation terms and links to official Glendale sources; it has no checklist, saved area, map or live source check. `public/offline.html` carries a condensed copy (leaving steps, what to do if trapped, the supply kit).

Server-only adapters for NWS weather alerts, CAL FIRE incidents, NIFC/WFIGS perimeters, AirNow observations and dated Glendale GIS standing-hazard maps are installed. **Production UI and personalized POST routes are paused** while source rights, caching, rate limits and monitoring are reviewed. `FIREPOINT_DEMO_LIVE_SOURCES=enabled` permits explicit queries in local nonproduction development only; it is not a public coverage claim. None of these sources checks a City/County evacuation order or verified standing evacuation zone. An offline fallback keeps a separate local checklist, **not** live notices, maps or a safe route. The service worker also caches the homepage shell, so its bundled shelter list and straight-line compass guidance open offline without map tiles. There is no durable ingestion worker, report service or ElevenLabs endpoint.

## Run locally

Use Node.js and npm compatible with the checked-in `package-lock.json`:

```bash
npm ci
cp .env.example .env.local  # add a public Mapbox pk. token for tiles; keep other keys server-only
npm run dev
```

Open <http://localhost:3000>. The local page is development software, not a deployed emergency service. Before a change is ready for review, run:

```bash
npm run lint
npm run typecheck
npm test
npm run build
# or: make check
```

The `Makefile` also has `make gis-fetch`/`make gis-local` developer-only MCP steps. GitHub Actions runs these four web checks for PRs and `main` pushes, with no secret-dependent source calls. Report the result of each command separately. Lint, typecheck, tests, and build do not establish agency source coverage or operational readiness.

## Plan and working agreements

- [Team start](docs/team-start.md): setup, small-change workflow, review gates, and proposed feature boundaries.
- [Source policy](docs/source-policy.md): source trust, coverage, freshness, location privacy, offline behavior, and reports.
- [Data contracts](docs/contracts.md): proposed and implemented schemas; check its status notes before claiming a route or UI integration exists.
- [Map decisions](docs/maps.md): current Mapbox home, secondary OpenFreeMap map, attribution, cost, privacy and limits.
- [PWA storage, systems, audio and route handoff](docs/pwa-storage-and-systems.md): shipped versus proposed behavior and provenance gates.
- [Resident stories](docs/user-stories.md), [four-person scope](docs/hackathon-roles.md), and [source/storage roadmap](docs/source-roadmap.md): proposals and ownership boundaries, not shipped services.
- [Product vision](docs/vision.md) and [broader API roadmap](docs/roadmap.md): teammate proposals for later phases. Check their assumptions against the source policy and current status before promising a live feature.

Implemented adapters include NWS point alerts, CAL FIRE incidents, NIFC/WFIGS current perimeters, AirNow observations and Glendale GIS dated hazard maps. All are request-time with no durable cache or polling; production queries are paused. NWS is inactive without a real identifying contact and AirNow without a key. None of them is an evacuation feed. Other documents describe future work. Before showing a source in the app, verify its publisher, jurisdiction, update behavior, access terms, and geographic coverage. Never substitute a map view, neighborhood name, or empty feed response for an evacuation status.

## Routes & shelters (location + routing)

The homepage (`/`) is one full-screen [Mapbox](https://www.mapbox.com/) map: the drag-a-fire panel on top, a light/dark toggle and the **Official sources & prep** link beside it, and a compact directions bar underneath. `/map` redirects here. When the page opens, it asks for the device's location (the browser's own prompt), centers on a blue dot, and computes two routes:

- **🏠 Nearest shelter** (solid blue): open, not-full shelters more than 1 km outside every hazard, ranked by straight-line distance. Driving routes are requested for the top three, and the fastest route (or Mapbox alternative route) whose path stays more than 500 m outside every hazard wins. If all three are rejected, the next three are tried. If none clears, the row says "No safe shelter route — follow evacuation route."
- **🚗 Escape route** (dashed orange): the evacuation point whose bearing differs most from the bearing to the nearest hazard, with the same path check. It is listed first within 3 km of a hazard. If every driving route passes a hazard, the row points directly away from the hazard and offers no **Go** link, since a maps app would take the same road.

**Fire marks are private visual bookmarks, not fire reports.** Dragging the flame onto the map (or pressing it to drop one at the map center) places a mark saved only in this browser. Marks are shown as draggable pins with **dashed, low-opacity red 500 m display halos**. That UI radius is arbitrary: it is **not** a measured fire extent, warning/order zone, or route-avoidance buffer. The halo uses the same dash rhythm and radius-label style as the `/prepare` defensible-space figure so both read as drawings, and a legend appears once a mark exists; the two share only that drawing convention (`src/domain/ring-visual.ts`), never a unit (feet vs metres), a source or a meaning. Moving or overlapping marks does not change routes or emergency status. Even multiple private marks do not imply a live fire event, perimeter, evacuation zone or multi-user report. A future public report flow needs separate consent, moderation, privacy protection and provenance.

Each route is one row in the bar. Tapping a row shows step-by-step directions and details, and **Go** opens Apple Maps on iOS or Google Maps elsewhere, passing only the destination. If routing fails or the device is offline, a row shows the straight-line direction and distance, and its details show a north-up compass arrow and the shelter address. The camera centers on each new start location, fits the first routes found for it, and afterwards stays where the person leaves it. The round button recenters it.

**Data status: nothing here is operational.** Shelters in [`src/evacuation/data/glendale.ts`](src/evacuation/data/glendale.ts) are `verified: false`, with capacity, occupancy, pets, and ADA set to `null` (unknown) until the City of Glendale or the Red Cross confirms them. Their coordinates come from the City of Glendale address geocoder. For **historical reference only**, [`src/evacuation/data/recent-shelters.json`](src/evacuation/data/recent-shelters.json) cites sites that opened in past disasters; they are not known open today and are not used for routing. The incident hazard feed is disconnected and returns empty; the default simulated Verdugo fire and its toggle were removed. Private marks have display-only dashed halos and are **not** routing hazards. Empty does not mean all-clear. **Hardcoded shelter `open` statuses, invented escape targets and automatic shelter routing remain public-release blockers**, even when escape-route calculation needs a tap; keep Vercel protection on until they are gated or replaced with verified agency inputs.

### Mapbox setup

1. In the Mapbox account, copy a **public** token (`pk.…`) and put it in `.env.local` as `NEXT_PUBLIC_MAPBOX_TOKEN` (see `.env.example`). Restart `npm run dev`. The same token powers the homepage map.
2. In Mapbox → Tokens, restrict the token to your site URLs (`http://localhost:3000` for development, plus the production domain). A `NEXT_PUBLIC_` value is shipped to every visitor by design, so the URL restriction is what protects it. Never use a secret (`sk.…`) token here.
3. Without a token, the map area says so, and both rows fall back to straight-line directions.

The page uses three Mapbox services: map loads (Mapbox GL JS with the `streets-v12` style, or `dark-v11` in dark mode), Directions with the traffic-aware `driving-traffic` profile, and Geocoding v6. Each counts against Mapbox's free tier, so check current pricing before launch. Mapbox's terms require the Mapbox logo and attribution to stay visible; they sit at the bottom corners of the map, above the bar.

### HTTPS is required for live location

Browsers only expose `navigator.geolocation` in a [secure context](https://developer.mozilla.org/docs/Web/Security/Secure_Contexts): `https://` or `http://localhost`. When you test on a phone over the LAN (`http://192.168.x.x:3000`), location is blocked and the page falls back to Glendale City Hall. Use an HTTPS tunnel or `next dev --experimental-https` to test on a device, and add that URL to the token's allowed URLs. Every deployment must be served over HTTPS.

### Location behavior

- The page starts `watchPosition` as soon as it opens, so the browser shows its permission prompt right away, like a maps app. While the prompt is up, the bar says why: "Allow location access to see routes from where you are." This is a deliberate product choice for the homepage map; [team start](docs/team-start.md) otherwise asks for location at the moment of use.
- `watchPosition` runs with `{ enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }`. On timeout or unavailable position it retries once, then falls back to Glendale City Hall. If a fix arrives later, the page switches to it automatically.
- If permission is denied, or the page isn't on HTTPS, routes start from Glendale City Hall and **Enter address** takes an address or ZIP (Mapbox Geocoding, bounded to the Glendale area).
- Reported accuracy worse than 100 m shows "Location approximate".
- Device locations more than 50 km from Glendale route from City Hall instead, with a notice, because the shelter data only covers Glendale.
- Routes are recalculated only after moving more than 150 m, or when the hazard list changes. GPS ticks are coalesced (1.5 s debounce), movement-triggered runs are at least 8 s apart, and a newer run cancels an in-flight one. See [`route-planner.ts`](src/evacuation/route-planner.ts).
- Positions stay in memory. Nothing stores or logs them.

**Third parties.** Mapbox receives each route's start and end coordinates (in the POST body of the Directions request, not the URL), any typed address (in the Geocoding URL), and the visible map area through tile requests. Mapbox GL JS also reports map-load usage to Mapbox. Review Mapbox's privacy terms before a public launch.

### Swapping the routing provider

The app calls exactly one function: `getRoute(from, to, { signal })` in [`src/evacuation/route-provider.ts`](src/evacuation/route-provider.ts). It must resolve to:

```ts
type Route = {
  path: LatLng[]; distanceMeters: number; durationSeconds: number;
  steps: { instruction: string; distanceMeters: number; durationSeconds: number }[];
  alternatives?: Route[]; // optional; the hazard check falls back to these
};
```

It must reject (never resolve with an empty route) when no route exists. To swap providers, write a function with the `GetRoute` type and assign it to `activeProvider`. Validate the provider's payload with Zod the way `parseMapboxDirections` does. Providers that need a secret key, such as the Google Routes API, belong behind an app-owned server route. Point `getRoute` at that route, send coordinates in a POST body as [`docs/contracts.md`](docs/contracts.md) requires, and keep the key off the browser. Providers that can avoid areas (Mapbox Directions `exclude`, GraphHopper custom models) could route around a hazard rather than only rejecting routes that cross it.

### Replacing the hazard stub with the real disaster feed

[`src/evacuation/hazards.ts`](src/evacuation/hazards.ts) is the only file to change. Keep its two exports:

- `getActiveHazards(): readonly Hazard[]` returns the current list. It must return the **same array instance** until the list changes, because the page reads it with React's `useSyncExternalStore`.
- `subscribeToHazards(listener): () => void` calls `listener()` after each change and returns an unsubscribe function.

Each `Hazard` is `{ id, type: 'fire'|'flood'|'hurricane'|'earthquake'|'heat', center: { lat, lng }, radiusMeters, severity: 1–5, label, simulated }`. The `src/evacuation/hazards.ts` stub currently returns a stable empty snapshot; no default demo hazard or toggle exists. A future feed must publish only verified, source-labeled geometries, not turn private marks into hazards. Any change to an id, center, radius, or severity triggers a route recalculation. Run the feed through the [source policy](docs/source-policy.md) first: failed or empty feeds must show their source state, never read as safe.

### Offline

Shelter and evacuation-point data are bundled with the page. After one online visit, the service worker serves the cached homepage shell and its static assets (network-first), so the page opens offline and shows straight-line compass guidance. An existing route plan is kept while offline unless the hazard list changes. Map tiles, routes, and address search need a connection. When shelters later come from a live feed, persist the last good list with its retrieval time and label it as last-synced, following [`docs/contracts.md`](docs/contracts.md#storage-boundary).

### Module map

| File | Role |
| --- | --- |
| `src/evacuation/routing.ts` | Pure logic: `haversine`, `bearing`, `pointInHazard`, `routeIntersectsHazard`, `pickShelter`, `pickEscapePoint`, `pickEscapeRoute`, `escapeHeading` |
| `src/evacuation/route-provider.ts` | `getRoute` and the Mapbox Directions provider |
| `src/evacuation/geocode.ts` | Address/ZIP fallback (Mapbox Geocoding) |
| `src/evacuation/location.ts` | `watchPosition` state machine: prompt on load, retry, fallback, manual |
| `src/evacuation/route-planner.ts` | When to recalculate (150 m / hazard change / debounce) |
| `src/evacuation/hazards.ts` | Hazard stub (replace with the real feed) |
| `src/evacuation/marks.ts` | Display-only private sketch halos; keeps marks out of routing hazards |
| `src/domain/ring-visual.ts` | Shared ring drawing convention (dash, order, label) for the `/prepare` defensible-space figure and private halos; unit, meaning and citation stay per kind |
| `src/components/ring-legend.tsx` | One-line legend naming a drawn ring as what it is (a private 500 m sketch on the map) |
| `src/evacuation/data/glendale.ts` | Shelters (unverified), evacuation points, City Hall default |
| `src/lib/mapbox.ts` | Token and light/dark style URLs |
| `src/components/evacuation-map.tsx` | Mapbox GL map (client-only): blue dot, hazards, fire marks, pins, routes |
| `src/components/fire-pins.ts`, `fire-panel.tsx` | Animated, draggable fire marks and the drag-a-fire panel |
| `src/components/route-bar.tsx` | Compact bar: status, route rows, steps, compass fallback |
| `src/components/map-screen.tsx` | The homepage: wires location, hazards, fire marks, and the planner to the map and bar |
