# Firepoint

Firepoint is a planned, account-optional mobile web app for emergency awareness and personal preparedness in Glendale, California. Nearby Southern California coverage is a future possibility **only where source coverage and rights have been checked**. A resident should be able to choose an area, find clearly attributed hazard information and links to agency notices, and keep a personal preparation checklist. The area-specific, source-backed parts of this plan are **proposed, not shipped**; see the current status below.

**Release blockers:** The developer-only routing prototype still shows unverified `open` shelters, offers invented escape targets and routes to a shelter automatically; none of those routes is verified fire-safe. PR #19 keeps the visitor's private marks as display-only sketches, never routing hazards. The production release gate excludes the routing prototype and serves only a basemap, private marks and the statement *No verified incident, shelter or route loaded*. An older installed service worker can retain a prior prototype homepage until that device reconnects and updates; a blank map is not an all-clear. NWS, fire/air and Glendale GIS adapters exist, but the production source panel and POST queries are paused pending rights, caching, rate limits and monitoring. The local-only `FIREPOINT_DEMO_LIVE_SOURCES=enabled` switch is for developer integration tests, not a public coverage claim. The map and official agency links are separate.

**Not an official City of Glendale service.** Firepoint does not issue evacuation orders, determine whether a place is safe, or provide an all-clear. For an emergency, follow the responsible public agency and local emergency services. Do not rely on this app as your only source of information.

## App preview

Current `/prepare` wildfire guide, captured from the production build of `main` at commit [`ae0c994`](https://github.com/Astrotemporal/firepoint/commit/ae0c994) on 2026-09-26 (16:23 America/Los_Angeles) with `scripts/capture-preview.mjs`. No Mapbox token was configured, no live source was queried, and no private marks or keys appear. They show the `/prepare` guide only, **not** the Mapbox homepage. Later `main` commits (PRs #26 and #29) changed the map page's location prompt and translations, not the guide, so these images were not retaken; the SHA above is the build they show. The photos are public-domain US government works credited on the page.

| Phone (390×844, first screen) | Desktop (1440×900, first screen) |
| --- | --- |
| ![Firepoint /prepare on a phone: a navy app bar with a Map back link, the title Wildfire guide, an EN language select and a theme toggle; Ready, Set and Go chips; a cover photo of the Eaton Fire captioned A wildfire guide for Glendale with the words Ready. Set. Go.; a USDA Forest Service public-domain credit; and the opening paragraph about dry brush, strong winds and the LA County Fire Department plan](docs/preview/prepare-mobile-first-screen.png) | ![Firepoint /prepare on a desktop browser: the same wildfire guide as one centered phone-width column under a full-width navy app bar with a Map back link, the title Wildfire guide, an EN language select and a theme toggle; Ready, Set and Go chips; the Eaton Fire cover photo with Ready. Set. Go.; the opening paragraph; and the top edge of the orange In danger? Call 911 card](docs/preview/prepare-desktop-first-screen.png) |

The two images above are the first viewport (top 844 px / top 900 px) of the full-page captures the script writes: [`docs/preview/mobile.png`](docs/preview/mobile.png) (390×11474) and [`docs/preview/desktop.png`](docs/preview/desktop.png) (1440×9903). The full pages continue through the "In danger? Call 911" card with the zone-check and Glendale Alerts links, the chapter list, the Ready, Set and Go chapters and the official-sources list. The guide is also available in Spanish and Eastern Armenian through the language select (PR #23); the captures show English. These are snapshots of static guide text, not a live status.

[The preview workflow](.github/workflows/preview.yml) runs the same script on PRs and `main` pushes and uploads the PNGs as **read-only, 14-day GitHub Actions artifacts** (`firepoint-preview`). It does not push bot commits to `main`, load the Mapbox home, or query live sources. Checked-in PNGs are refreshed by hand in a reviewed PR and may lag `main`; the commit SHA above says which build they show.

**Historical, not current:** [`docs/preview/map-mobile.png`](docs/preview/map-mobile.png) and [`docs/preview/map-desktop.png`](docs/preview/map-desktop.png) show the Mapbox homepage as of commit `839cba2` (2026-09-26, before PRs #13, #16 and #18). They still show the old "Drag the fire onto the map" card and predate the directions drawer, the floating fire tile and the on-request escape route, so they are kept only as a record. No current homepage screenshot is checked in: it needs internet and a browser-publishable, URL-restricted Mapbox token, which the capture workflow deliberately does not use. An earlier `/prepare` checklist screenshot was removed because that page no longer exists.

## What exists now

This repository began as a Next.js 16 starter and is under active development. The **`/` homepage is a full-screen Mapbox map** when a public `NEXT_PUBLIC_MAPBOX_TOKEN` is configured. In a production build it is the **public screen**: the basemap, a dark/light toggle, an EN/ES/AM language select, user-placed private flame marks (**not** confirmed incidents), the **Official sources & prep** link and a status card saying no verified incident, shelter or route is loaded; it never asks for the device's location, draws no official zone, order, fire perimeter or route, and lists no shelters. The routing prototype (a directions drawer that routes from the device location to an **unverified** shelter but private marks never steer a route; the hazard feed is an empty stub) is developer-only behind the [public release gate](#what-exists-now); see [Routes & shelters](#routes--shelters-location--routing). `/map` redirects to the homepage. Map tiles are not available offline. `/prepare` is a read-only, magazine-style wildfire guide adapted from the LA County Fire Department's [Ready! Set! Go! plan](https://fire.lacounty.gov/rsg/), with California's standard evacuation terms and links to official Glendale sources; it has no checklist, saved area, map or live source check. `public/offline.html` carries a condensed copy (leaving steps, what to do if trapped, the supply kit).

Server-only adapters for NWS weather alerts, CAL FIRE incidents, NIFC/WFIGS perimeters, AirNow observations and dated Glendale GIS standing-hazard maps are installed. **Production UI and personalized POST routes are paused** while source rights, caching, rate limits and monitoring are reviewed. `FIREPOINT_DEMO_LIVE_SOURCES=enabled` permits explicit queries in local nonproduction development only; it is not a public coverage claim. None of these sources checks a City/County evacuation order or verified standing evacuation zone. The offline fallback (`public/offline.html`) is a static condensed guide, **not** a checklist, live notices, maps or a safe route. The service worker caches only the public homepage shell (never the prototype, a login redirect or an error page; see [Offline](#offline)). There is no durable ingestion worker, report service or ElevenLabs endpoint.

**Homepage.** Every build, production included, serves the routing prototype described under [Routes & shelters](#routes--shelters-location--routing). The public release gate (#27) was removed; the prototype's shelters and escape targets are still hardcoded and unverified.

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

**Deployment status.** A Vercel project is connected to this repository through the Vercel GitHub integration; `vercel[bot]` builds a Preview deployment for each PR and a Production deployment for `main`. The current production deployment is <https://firepoint-sooty.vercel.app>. On 2026-09-26 it was reachable **publicly** without signing in (teammates confirmed HTTP 200 on `/` and `/prepare` while signed out; a later check saw a redirect to Vercel sign-in, so the setting was changing). Treat it as a **development deployment that may be public**, not an operational emergency service: until PR #27's release gate is deployed it still ships the unverified shelter list, the stub hazard feed and app-computed routes, which remain public-release blockers, and its source queries are paused. Once the gate is deployed, production serves the public no-data screen; a device that installed the earlier service worker keeps the prototype homepage cached until it reconnects and fetches the new worker (see [Offline](#offline)). Recommended now: in Vercel, Settings → Deployment Protection → Vercel Authentication → **All Deployments** (previews and production), then confirm the production URL asks for sign-in in a signed-out browser, and repeat that check after every settings change. Per-commit `*-ex-ars.vercel.app` URLs redirecting to Vercel SSO do not prove the production alias is protected. `main` currently has no GitHub branch protection or ruleset; PR #20 recommends adding one.

## Plan and working agreements

- [Team start](docs/team-start.md): setup, small-change workflow, review gates, and proposed feature boundaries.
- [Source policy](docs/source-policy.md): source trust, coverage, freshness, location privacy, offline behavior, and reports.
- [Data contracts](docs/contracts.md): proposed and implemented schemas; check its status notes before claiming a route or UI integration exists. [Observation aggregation](docs/observation-aggregation.md) is a pure contract for moderated community reports with no route, layer, or moderation owner behind it.
- [Map decisions](docs/maps.md): the Mapbox home, the removed OpenFreeMap/MapLibre area map, attribution, cost, privacy and limits.
- [PWA storage, systems, audio and route handoff](docs/pwa-storage-and-systems.md): shipped versus proposed behavior and provenance gates.
- [Crowd reports and tiered map research](docs/crowd-report-zones.md): unverified report-density concept, not a fire perimeter or safe zone.
- [Source coverage and a real GIS snapshot example](docs/source-capabilities-example.md): dated published data, not a live incident or all-clear.
- [Vercel / v0 deployment start](docs/deploy.md): environment setup, protected previews and hard release gates; no deployment is connected.
- [Resident stories](docs/user-stories.md), [four-person scope](docs/hackathon-roles.md), and [source/storage roadmap](docs/source-roadmap.md): proposals and ownership boundaries, not shipped services.
- [Product vision](docs/vision.md) and [broader API roadmap](docs/roadmap.md): teammate proposals for later phases. Check their assumptions against the source policy and current status before promising a live feature.

Implemented adapters include NWS point alerts, CAL FIRE incidents, NIFC/WFIGS current perimeters, AirNow observations and Glendale GIS dated hazard maps. All are request-time with no durable cache or polling; production queries are paused. NWS is inactive without a real identifying contact and AirNow without a key. None of them is an evacuation feed. Other documents describe future work. Before showing a source in the app, verify its publisher, jurisdiction, update behavior, access terms, and geographic coverage. Never substitute a map view, neighborhood name, or empty feed response for an evacuation status.

## Routes & shelters (location + routing)

> **Unverified prototype.** Shelters are hardcoded as `open` and escape targets are invented; nothing here is verified emergency guidance.

The homepage (`/`) is one full-screen [Mapbox](https://www.mapbox.com/) map: a floating fire tile at the bottom right, a light/dark toggle, an EN/ES/AM language select (PR #29 translates the map text; shelter names, addresses and Mapbox road steps for Armenian stay as published) and the **Official sources & prep** link at the top, and a directions drawer (bottom sheet on phones, side card on desktop). `/map` redirects here. When the page opens, it checks whether the site may already use location: if so it starts watching, centers on a blue dot and computes the shelter route; if not, routes start from Glendale City Hall and a **Use my location** button (or the locate or Escape button) opens the browser's permission prompt on a tap (PR #26). With a location, it computes the shelter route. Since PR #16 the escape route is computed **only after the person taps the 🚗 Escape button** in the directions drawer (a bottom sheet on phones, a side card on desktop); until then no Directions request is made for it and nothing is drawn. The two routes:

- **🏠 Nearest shelter** (solid blue): open, not-full shelters more than 1 km outside every hazard, ranked by straight-line distance. Driving routes are requested for the top three, and the fastest route (or Mapbox alternative route) whose path stays more than 500 m outside every hazard wins. If all three are rejected, the next three are tried. If none clears, the row says "No safe shelter route — follow evacuation route."
- **🚗 Escape route** (dashed orange): the evacuation point whose bearing differs most from the bearing to the nearest hazard, with the same path check. It is listed first within 3 km of a hazard. If every driving route passes a hazard, the row points directly away from the hazard and offers no **Go** link, since a maps app would take the same road.

**Fire marks are private visual bookmarks, not fire reports.** Dragging the flame onto the map (or pressing it to drop one at the map center) places a mark saved only in this browser. Marks are shown as draggable grey pins with **dashed, low-opacity grey 500 m display halos** (`src/domain/private-mark-style.ts`: one neutral tone per theme, never changed by mark count or overlap; warm/red colours are not used for anything a person places). That UI radius is arbitrary: it is **not** a measured fire extent, warning/order zone, or route-avoidance buffer. The halo uses the same dash rhythm as the `/prepare` defensible-space figure so both read as drawings; it carries no on-canvas text (a map label cannot be language-tagged), and an English `lang="en"` legend appears once a mark exists; the two share only that drawing convention (`src/domain/ring-visual.ts`), never a unit (feet vs metres), a source or a meaning. Moving or overlapping marks does not change routes or emergency status. Even multiple private marks do not imply a live fire event, perimeter, evacuation zone or multi-user report. A future public report flow needs separate consent, moderation, privacy protection and provenance.

Each route is one row in the bar. Tapping a row shows step-by-step directions and details, and **Go** starts in-app turn-by-turn navigation ([`navigation.ts`](src/evacuation/navigation.ts)) instead of handing off to Apple or Google Maps. It asks for the device location if it isn't on yet, follows GPS fixes along the planned route, shows the next maneuver, time, distance and arrival time, and re-requests directions (hazard-checked like the planner, at most every 10 s) after two consecutive fixes off the route. Without a road route it shows a live straight-line arrow. The screen stays awake while navigating where the browser allows it, and the card always says the route isn't checked for fire or road closures. Like the rest of the routing prototype, navigation only renders with `FIREPOINT_PROTOTYPE_ROUTING=enabled` on `next dev`; production builds never ship it. If routing fails or the device is offline, a row shows the straight-line direction and distance, and its details show a north-up compass arrow and the shelter address. The camera centers on each new start location, fits the first routes found for it, and afterwards stays where the person leaves it. The round button recenters it.

**Data status: nothing here is operational.** Shelters in [`src/evacuation/data/glendale.ts`](src/evacuation/data/glendale.ts) are `verified: false`, with capacity, occupancy, pets, and ADA set to `null` (unknown) until the City of Glendale or the Red Cross confirms them. Their coordinates come from the City of Glendale address geocoder. For **historical reference only**, [`src/evacuation/data/recent-shelters.json`](src/evacuation/data/recent-shelters.json) cites sites that opened in past disasters; they are not known open today and are not used for routing. The incident hazard feed is disconnected and returns empty; the default simulated Verdugo fire and its toggle were removed. Private marks have display-only grey dashed halos and are **not** routing hazards. Empty does not mean all-clear. **Hardcoded shelter `open` statuses, invented escape targets and automatic shelter routing remain developer-prototype-only** behind the production release gate. Do not expose them as public guidance unless verified agency inputs replace them.

### Mapbox setup

1. In the Mapbox account, copy a **public** token (`pk.…`) and put it in `.env.local` as `NEXT_PUBLIC_MAPBOX_TOKEN` (see `.env.example`). Restart `npm run dev`. The same token powers the homepage map.
2. In Mapbox → Tokens, restrict the token to your site URLs (`http://localhost:3000` for development, plus the production domain). A `NEXT_PUBLIC_` value is shipped to every visitor by design, so the URL restriction is what protects it. Never use a secret (`sk.…`) token here.
3. Without a token, the map area says so, and both rows fall back to straight-line directions.

The page uses three Mapbox services: map loads (Mapbox GL JS with the `streets-v12` style, or `dark-v11` in dark mode), Directions with the traffic-aware `driving-traffic` profile, and Geocoding v6. Each counts against Mapbox's free tier, so check current pricing before launch. Mapbox's terms require the Mapbox logo and attribution to stay visible; they sit at the bottom corners of the map, above the bar.

### HTTPS is required for live location

Browsers only expose `navigator.geolocation` in a [secure context](https://developer.mozilla.org/docs/Web/Security/Secure_Contexts): `https://` or `http://localhost`. When you test on a phone over the LAN (`http://192.168.x.x:3000`), location is blocked and the page falls back to Glendale City Hall. Use an HTTPS tunnel or `next dev --experimental-https` to test on a device, and add that URL to the token's allowed URLs. Every deployment must be served over HTTPS.

### Location behavior

- On load the page queries the Permissions API. If location is already **granted**, `watchPosition` starts at once. If the state is `prompt`, the page does not ask; the drawer shows "From Glendale City Hall" with a **Use my location** button, and a tap on it, on the locate button or on Escape starts the watch so the browser shows its own prompt (browsers reliably show it only for a tap). If a denial arrives faster than a person could answer, location is blocked by the browser or the OS and the drawer says "Location off" without a button that cannot work (PR #26). Where the Permissions API is unavailable, the page asks on load as before. This follows [team start](docs/team-start.md), which asks for location at the moment of use.
- `watchPosition` runs with `{ enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }`. On timeout or unavailable position it retries once, then falls back to Glendale City Hall. If a fix arrives later, the page switches to it automatically.
- If permission is denied, not yet given, or the page isn't on HTTPS, routes start from Glendale City Hall and **Enter address** takes an address or ZIP (Mapbox Geocoding, bounded to the Glendale area).
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

After one online visit, the service worker ([`public/sw.js`](public/sw.js)) serves the cached homepage shell and its static assets (network-first), so the page opens offline. In production that shell is the public no-data screen. The worker stores a homepage only when it is a direct, same-origin 200 whose HTML carries the public-shell marker (`ev-shell-static`); the developer prototype, a login redirect or an error page is never cached, and an offline `/` with nothing cached gets `public/offline.html`. Map tiles need a connection.

**Cache migration.** The cache namespaces are versioned (`firepoint-shell-v5`, `firepoint-assets-v4`). A device that installed the pre-gate worker keeps the prototype homepage in its old caches until it fetches this worker online once; the new worker's activate step then deletes every older `firepoint-*` cache, and [`src/lib/service-worker.test.ts`](src/lib/service-worker.test.ts) exercises that. The routing homepage is never cached for offline use; offline, `/` serves the offline page. **A device that has not reconnected cannot be purged remotely**, and while Vercel deployment protection answers `/sw.js` with a login redirect the update itself cannot install; the purge happens on the first successful unauthenticated online visit after this ships. When shelters later come from a live feed, persist the last good list with its retrieval time and label it as last-synced, following [`docs/contracts.md`](docs/contracts.md#storage-boundary).

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
| `src/domain/private-mark-style.ts` | Neutral-grey visual policy for private pins, halos, labels and legend (light/dark); no count, threshold or status input |
| `src/domain/ring-visual.ts` | Shared ring drawing convention (dash, order, label) for the `/prepare` defensible-space figure and private halos; unit, meaning and citation stay per kind |
| `src/components/ring-legend.tsx` | One-line legend naming a drawn ring as what it is (a private 500 m sketch on the map) |
| `src/evacuation/data/glendale.ts` | Shelters (unverified), evacuation points, City Hall default |
| `src/lib/mapbox.ts` | Token and light/dark style URLs |
| `src/components/evacuation-map.tsx` | Mapbox GL map (client-only): blue dot, hazards, fire marks, pins, routes |
| `src/components/fire-pins.ts`, `fire-panel.tsx` | Animated, draggable fire marks and the drag-a-fire panel |
| `src/components/route-bar.tsx` | Compact bar: status, route rows, steps, compass fallback |
| `src/components/map-screen.tsx` | The homepage: wires location, hazards, fire marks, and the planner to the map and bar |
