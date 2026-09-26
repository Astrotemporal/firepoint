# Firepoint

Firepoint is a planned, account-optional mobile web app for emergency awareness and personal preparedness in Glendale, California. Nearby Southern California coverage is a future possibility **only where source coverage and rights have been checked**. A resident should be able to choose an area, find clearly attributed hazard information and links to agency notices, and keep a personal preparation checklist. The area-specific, source-backed parts of this plan are **proposed, not shipped**; see the current status below.

**Not an official City of Glendale service.** Firepoint does not issue evacuation orders, determine whether a place is safe, or provide an all-clear. For an emergency, follow the responsible public agency and local emergency services. Do not rely on this app as your only source of information.

## App preview

<img src="docs/preview/desktop.png" width="760" alt="Firepoint desktop view: official links, preparation checklist, tentative area label, and an optional street map button">

<details><summary>View the mobile preview</summary>

<img src="docs/preview/mobile.png" width="300" alt="Firepoint mobile view of the same static preparedness page">

</details>

[The preview workflow](.github/workflows/preview.yml) captures the **static page** on pull requests and refreshes these images after `main` pushes (or a manual workflow run), if GitHub Actions has permission to write to `main`. It deliberately does not load map tiles, query live notices, or display private location data. The interactive map can be opened in the running app while online.

## What exists now

This repository began as a Next.js 16 starter and is under active development. The homepage is one full-screen Mapbox map with a light/dark toggle. Visitors can drop private fire marks, saved only on this device, and a directions bar routes from the device location to the nearest open shelter and away from hazards. Marks are not reports; routes avoid them and a **simulated stub** fire, and the shelters are **unverified**; see [Routes & shelters](#routes--shelters-location--routing) below. `/map` redirects to the homepage. The `/prepare` page has outbound links to named official sources, a short checklist saved only after an item is checked, and an optional Glenoaks Canyon neighborhood label saved on this device. Neither the label nor the checklist is an official lookup. On `/prepare`, a click-to-load OpenFreeMap/OpenStreetMap street map gives general Glendale orientation **only while online**; it has no incident or zone overlay and does not locate the visitor. On `/prepare`, a "What public sources report right now" panel queries two server routes **only when the visitor asks**, for central Glendale or a one-time, rounded device location: `POST /api/v1/notices/query` (NWS weather alerts, needs a real `NWS_USER_AGENT` contact) and `POST /api/v1/context/query` (CAL FIRE incident points, NIFC/WFIGS mapped perimeters, and AirNow air quality when `AIRNOW_API_KEY` is set), plus `POST /api/v1/hazards/query` (Glendale GIS MCP mapped hazard zones from a dated snapshot, when the event's `GLENDALE_GIS_MCP_KEY` is set). Each source shows its own checked/unavailable/not-set-up status; an empty or failed source is never presented as an all-clear. Neither route ingests city evacuation orders or establishes operational coverage. Hazard lookup, verified evacuation-zone lookup, public reporting, accounts, and an operational backend are not shipped. A service worker supplies a separate offline checklist page and caches the homepage shell so its bundled shelter list works offline; it does not cache `/prepare`, official notices, API responses, routes, or map tiles. An offline map and live offline status are not shipped.

## Run locally

Use Node.js and npm compatible with the checked-in `package-lock.json`:

```bash
npm ci
cp .env.example .env.local  # optional; add a real contact to NWS_USER_AGENT for the server-only NWS route
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
- [Map decisions](docs/maps.md): online basemap attribution and limits.
- [Resident stories](docs/user-stories.md), [four-person scope](docs/hackathon-roles.md), and [source/storage roadmap](docs/source-roadmap.md): proposals and ownership boundaries, not shipped services.
- [Product vision](docs/vision.md) and [broader API roadmap](docs/roadmap.md): teammate proposals for later phases. Check their assumptions against the source policy and current status before promising a live feature.

Implemented source integrations are NWS point alerts, CAL FIRE incidents, NIFC/WFIGS current perimeters and AirNow observations, all request-time with no durable cache or polling. NWS is inactive without a real identifying contact and AirNow without a key. None of them is an evacuation feed. Other documents describe future work. Before showing a source in the app, verify its publisher, jurisdiction, update behavior, access terms, and geographic coverage. Never substitute a map view, neighborhood name, or empty feed response for an evacuation status.

## Routes & shelters (location + routing)

The homepage (`/`) is one full-screen [Mapbox](https://www.mapbox.com/) map: the drag-a-fire panel on top, a light/dark toggle and the **Official sources & prep** link beside it, and a compact directions bar underneath. `/map` redirects here. When the page opens, it asks for the device's location (the browser's own prompt), centers on a blue dot, and computes two routes:

- **🏠 Nearest shelter** (solid blue): open, not-full shelters more than 1 km outside every hazard, ranked by straight-line distance. Driving routes are requested for the top three, and the fastest route (or Mapbox alternative route) whose path stays more than 500 m outside every hazard wins. If all three are rejected, the next three are tried. If none clears, the row says "No safe shelter route — follow evacuation route."
- **🚗 Escape route** (dashed orange): the evacuation point whose bearing differs most from the bearing to the nearest hazard, with the same path check. It is listed first within 3 km of a hazard. If every driving route passes a hazard, the row points directly away from the hazard and offers no **Go** link, since a maps app would take the same road.

**Fire marks steer the routes.** Dragging the fire onto the map (or pressing it to drop one at the map center) places a mark, saved only in this browser. Each mark counts as a fire with a 500 m radius (`MARK_RADIUS_METERS` in [`src/evacuation/marks.ts`](src/evacuation/marks.ts)), so the same buffers apply: shelters within 1 km of its edge are skipped and routes must stay 500 m clear of it. Placing, moving, or removing a mark recalculates the routes. Marks are drawn as the animated fire with a lighter shaded area, and every label says they are private and not reports.

Each route is one row in the bar. Tapping a row shows step-by-step directions and details, and **Go** opens Apple Maps on iOS or Google Maps elsewhere, passing only the destination. If routing fails or the device is offline, a row shows the straight-line direction and distance, and its details show a north-up compass arrow and the shelter address. The camera centers on each new start location, fits the first routes found for it, and afterwards stays where the person leaves it. The round button recenters it.

**Data status: nothing here is operational.** Shelters in [`src/evacuation/data/glendale.ts`](src/evacuation/data/glendale.ts) are `verified: false`, with capacity, occupancy, pets, and ADA set to `null` (unknown) until the City of Glendale or the Red Cross confirms them. Their coordinates come from the City of Glendale address geocoder. Besides the person's own fire marks, the only hazard is a **simulated** fire in the Verdugo Mountains, labeled as simulated on the map and in the bar, and a toggle in the bar hides it. The bar always says live fire data isn't connected and that this is not an all-clear.

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

Each `Hazard` is `{ id, type: 'fire'|'flood'|'hurricane'|'earthquake'|'heat', center: { lat, lng }, radiusMeters, severity: 1–5, label, simulated }`. Set `simulated: false` only for real incidents from a vetted source. Any change to an id, center, radius, or severity triggers a route recalculation. Delete `SIMULATED_HAZARDS`, `setStubHazards`, and the bar's demo toggle when the feed lands. Run the feed through the [source policy](docs/source-policy.md) first: a failed or empty feed must surface as "unavailable", never as an empty list that reads as safe.

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
| `src/evacuation/marks.ts` | Turns fire marks into hazards for routing (`MARK_RADIUS_METERS`) |
| `src/evacuation/data/glendale.ts` | Shelters (unverified), evacuation points, City Hall default |
| `src/lib/mapbox.ts` | Token and light/dark style URLs |
| `src/components/evacuation-map.tsx` | Mapbox GL map (client-only): blue dot, hazards, fire marks, pins, routes |
| `src/components/fire-pins.ts`, `fire-panel.tsx` | Animated, draggable fire marks and the drag-a-fire panel |
| `src/components/route-bar.tsx` | Compact bar: status, route rows, steps, compass fallback |
| `src/components/map-screen.tsx` | The homepage: wires location, hazards, fire marks, and the planner to the map and bar |
