# Project status

What Firepoint does today, what is placeholder data, and what has to happen before a public launch. Last reviewed 2026-09-26, at `main` commit `72d8673`.

Firepoint is a **prototype**. It is not an official City of Glendale service and is not operational emergency infrastructure.

## Working today

| Feature | Notes |
|---|---|
| Full-screen Mapbox homepage | Light/dark themes; needs a public `NEXT_PUBLIC_MAPBOX_TOKEN` |
| Fire marks | Drag a flame onto the map to sketch a fire. Saved only in this browser; never shared or treated as a report |
| Shelter and escape routing | Road routes that stay clear of marked fires, with step-by-step directions and in-app turn-by-turn navigation. See [architecture.md](architecture.md) |
| Location | Asks only on a tap; falls back to Glendale City Hall or a typed address; positions are never stored |
| `/prepare` wildfire guide | Adapted from LA County Fire's [Ready! Set! Go!](https://fire.lacounty.gov/rsg/) plan, with links to official Glendale sources |
| Languages | English, Spanish and Eastern Armenian (map and guide). See [translations.md](translations.md) |
| Offline fallback | `public/offline.html`, a condensed guide: how to leave, what to do if trapped, the supply kit |
| CI | Lint, typecheck, 290 unit tests and a production build on every PR and `main` push; `/prepare` screenshots on PRs |

## Placeholder or demo data

These ship in every build, production included. The public release gate that used to hide them was removed in commit `ffa07c7`.

- **Shelters are unverified.** [`glendale.ts`](../src/evacuation/data/glendale.ts) marks them `open` but `verified: false`, with unknown capacity, pets and accessibility. The 31 police and fire stations are routable destinations, not designated shelters.
- **Escape targets are computed, not official.** They are the nearest reachable points outside a marked fire's danger zone, not agency-published evacuation points.
- **The hazard feed is empty.** [`hazards.ts`](../src/evacuation/hazards.ts) is a stub. Only the visitor's own fire marks affect routes. An empty map does not mean all-clear.
- **Routes aren't checked** for road closures or real fire perimeters.

## Built but not connected to the UI

Server-side adapters exist and are tested, but production queries are paused until source rights, caching, rate limits and monitoring are reviewed. `FIREPOINT_DEMO_LIVE_SOURCES=enabled` turns them on for local development only.

| Source | Data | Needs |
|---|---|---|
| NWS | Weather alerts (Red Flag Warnings, wind) | `NWS_USER_AGENT` with a real contact |
| CAL FIRE | Active incidents | — |
| NIFC / WFIGS | Current fire perimeters | — |
| AirNow | Air-quality observations | `AIRNOW_API_KEY` |
| Glendale GIS MCP | Dated standing-hazard maps (e.g. CAL FIRE hazard zones) | `GLENDALE_GIS_MCP_KEY`, or `npm run gis:local` |

None of these is an evacuation-order feed.

## Not built yet

- Official evacuation orders and zones (LA County / Genasys)
- Notifications (Web Push, SMS, email)
- Community reports and moderation (contracts drafted in [observation-aggregation.md](observation-aggregation.md) and [crowd-report-zones.md](crowd-report-zones.md))
- ElevenLabs voice read-aloud
- Accounts, saved places and household plans
- Offline map tiles

## Before a public launch

1. Replace hardcoded shelters and computed escape targets with verified agency data, or label them clearly as demo data in the UI.
2. Connect the hazard feed to a verified source, and show each source's freshness and failure state.
3. Settle source rights, caching, rate limits and monitoring for the adapters above.
4. Decide Vercel deployment protection. The production deployment at <https://firepoint-sooty.vercel.app> may be publicly reachable; on 2026-09-26 its protection setting was changing.
5. Add branch protection to `main`.

## Roadmap

See [vision.md](vision.md) for where the product is headed, [roadmap.md](roadmap.md) for the API scope and phases, and [source-roadmap.md](source-roadmap.md) for source and storage plans.
