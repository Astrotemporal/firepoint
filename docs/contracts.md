# Firepoint shared contract (v1)

This is a **new contract authored for Firepoint**, not the earlier Trigger Point model/scenario schema. The executable source of truth is [`src/domain/contracts.ts`](../src/domain/contracts.ts); its tests use conspicuously synthetic values and never reach the UI. Import Zod validators at network/storage boundaries and derive types with `z.infer`. There is no public reporting service, standing evacuation-zone lookup, or official city partnership (the GIS adapter reads mapped hazard zones only; see [Mapped hazard zones](#mapped-hazard-zones)). Present source adapters handle NWS point-filtered weather alerts plus CAL FIRE incidents, NIFC/WFIGS perimeters and AirNow observations (see [Fire and air context](#fire-and-air-context)). The source panel is **paused in production** pending source-rights, caching, rate-limit and monitoring review. In local nonproduction development only, `FIREPOINT_DEMO_LIVE_SOURCES=enabled` restores user-initiated queries for testing; the three POST routes otherwise return 503 without contacting publishers. An empty feed is never an all-clear.

## Client flow

1. Show a selected coarse area or ask for an optional one-time location. Do not silently request GPS or require an account. A precise point is `[longitude, latitude]` in WGS84; a point query belongs in a **POST body**, never in a GET URL, referrer, or analytics event.
2. A response is a `NoticeFeedSchema` with `version: 1`, `generatedAt`, an array of `sourceChecks`, `notices`, and `allClear: false`. Render each source's `status`, `lastSuccessAt` and `detail` before interpreting items. `notices: []` only says those applicable sources had no matching returned records; it does not say the resident is safe.
3. `OfficialNoticeSchema` carries original `headline`, description/instructions if supplied, issuer identity if known, operator, record URL, times and `match` method. The match `publisher-point-filter` means the publisher returned a notice for the queried point; it is not an official evacuation-zone identifier. Only an issuing agency can issue or end an order.
4. `StandingHazardSchema` carries mapped context with verified footprint or an unavailable state. `EvacuationZoneSchema` must stay `unavailable` until an agency-verified standing-zone dataset/lookup is integrated. A City neighborhood or CAL FIRE hazard class does not supply `zoneId`.
5. `PublishedObservationSchema` always says `verification: unverified`; its public text must be redacted before serialization. `SubmissionReceiptSchema` only means a backend actually received a submission for moderation; it cannot mean publication or emergency dispatch. There is currently no report API or database.

### One safe parser for future UI code

```ts
import { NoticeFeedSchema } from "@/domain/contracts";

export function parseNoticeResponse(payload: unknown) {
  const parsed = NoticeFeedSchema.safeParse(payload);
  return parsed.success
    ? { state: "received" as const, value: parsed.data }
    : { state: "unavailable" as const };
}
```

The resident UI calls the route only when the visitor asks, and the NWS User-Agent is blank by default. Show **“Not checked”** with direct official links until a real user-initiated query succeeds. HTTP 404/501/503, transport failure, or malformed JSON is unavailable, *not* a synthetic empty feed. Synthetic fixtures belong only in `*.test.ts`.

## Source clocks and response behavior

`SourceCheckSchema` records `lastAttemptAt` separately from `lastSuccessAt`, the publisher's `sourceAsOf` if known, a source-specific `staleAfterSeconds`, applicability to this query, and a non-reassuring failure detail. `ok` requires an actual successful fetch; `stale` requires a real last-good record; `not-configured` and `down` need explanations. A status is about **one feed**, not the whole city. Never rewrite an upstream issue timestamp with our retrieval time.

The first server endpoint, `POST /api/v1/notices/query`, accepts `PlaceQuerySchema` and currently covers **only NWS weather alerts**. It uses `Cache-Control: no-store`, bounds the request and NWS timeout, and never echoes the queried point in the source-check URL. It returns 503 plus a typed `not-configured`/`down` state if no valid identifying NWS User-Agent is set or the upstream source fails. There is no durable last-good cache, rate-limit service, or city evacuation adapter; do not describe it as operational emergency coverage. Add source-specific caching, point-log redaction, abuse protection, and monitoring before public release. A future `GET /api/v1/source-health` can expose operational health without leaking user locations.

For UI teammate tasks: create loading, unavailable, stale, expired, outside-coverage, and verified-source views first. Do not import code from a model pipeline or fill an empty feed with demonstration numbers. Check the original link and exact text before any optional text-to-speech. For backend tasks: add adapters one publisher at a time, record license/jurisdiction/geography, test broken payloads and partial outages, and independently check the public display against the issuer. See [source policy](source-policy.md).

## Fire and air context

`POST /api/v1/context/query` takes the same `PlaceQuerySchema` body and returns a `ContextFeedSchema` (`version: 1`, `radiusKm`, `sourceChecks`, `incidents`, `perimeters`, `airQuality`, `allClear: false`). These are **context lanes**, deliberately separate from `OfficialNotice`: none is an order, forecast, spread prediction or safety verdict, and every item carries a `caveat` and an `origin` with the publisher's own clock.

| Source key | Publisher and data | Location sent upstream | Notes |
| --- | --- | --- | --- |
| `calfire-incidents` | CAL FIRE active incident points (`WildfireIncidentSchema`) | None; the statewide list is fetched and filtered to `radiusKm` (80 km) on our server | `distanceKm` is from the queried point. Off-site record links fall back to the CAL FIRE incident index. |
| `nifc-current-perimeters` | NIFC/WFIGS current perimeters (`FirePerimeterSchema`, Polygon/MultiPolygon) | A coarse envelope centred on a 0.1°-snapped point | `polygonCapturedAt` is the publisher's mapping time, distinct from `retrievedAt`. Types: wildfire, prescribed, complex, unknown. A truncated page (`exceededTransferLimit`) is `down`, not a partial result. |
| `airnow-current-observations` | AirNow current reporting-area observations (`AirQualityReadingSchema`) | A 0.1°-snapped point; the key stays server-side | `preliminary: true` always. Negative "no data" AQI values are omitted. `not-configured` without `AIRNOW_API_KEY`. |

Each source produces its own check even when it fails. The route answers 200 when at least one source succeeded and 503 when none did; in both cases, read `sourceChecks` before interpreting empty lists. The resident panel rounds a one-time device location to three decimals before sending it and never stores it.

## Mapped hazard zones

`POST /api/v1/hazards/query` takes the same `PlaceQuerySchema` body and returns a `StandingHazardFeedSchema` (one `glendale-gis-hazards` source check plus seven `StandingHazardSchema` items: wildfire, flood, fault-rupture, liquefaction, landslide, dam-inundation, debris-flow). It calls the hackathon-hosted [Glendale GIS MCP](https://github.com/HackerFund/GlendaleGisMcp) `hazards_at_location` tool server-side with `Authorization: Bearer $GLENDALE_GIS_MCP_KEY`; without a key the check is `not-configured` and no request is made.

- These are **regulatory reference maps from a dated snapshot**, never current conditions, evacuation zones or a property safety rating. `sourceAsOf` is the snapshot fetch time; `origin.updatedAt` is the publisher's last edit of that layer; `origin.issuer` is the agency (CAL FIRE, FEMA, CGS, DWR, USGS).
- `lookup: outside` means "not in a mapped zone", which is **not** "no hazard"; each item's `caveat` carries the server's notes and disclaimer. CAL FIRE `NonWildland` is unzoned, not safe.
- A point outside Glendale plus about 2 km gives `lookup: unavailable, coverage: out-of-bounds` for every layer and a check status of `outside-coverage`. A rejected key (401) or rate limit (429) is `down` with a named detail.
- **Local development without the event key:** set `GLENDALE_GIS_MCP_URL=http://127.0.0.1:8765/mcp` and any made-up `GLENDALE_GIS_MCP_KEY` in `.env.local`, then run `npm run gis:local` in a second terminal (needs [uv](https://docs.astral.sh/uv/)). It runs the `.mcp.json`-pinned server over HTTP on this machine only, requiring that same key. The adapter accepts plain HTTP only for `127.0.0.1`/`localhost`. `npm run gis:stub` starts a SYNTHETIC loopback stand-in for adapter tests only, never for demos.
- **Bounds:** one upstream `tools/call` per lookup, no redirects followed, JSON or event-stream replies only, at most 1 MiB read (streamed, then cancelled) within a 10 s whole-call timeout. Every breach is `down`, never "not in a zone". Exact values, the local-versus-production wiring table, and the rollout blockers are in [glendale-gis-integration.md](glendale-gis-integration.md).
- The hazard layers' reuse terms still need the per-source review in [source policy](source-policy.md) before resident launch.

## Storage boundary

The installed service worker may cache the app shell and static guide, but never invents alert delivery. Small device-only preferences can use localStorage. If report drafts or bounded last-success notices are introduced, use versioned IndexedDB with explicit deletion, source timestamps and expiry; it is not secure storage on a shared phone. A public reporting system needs a separate durable database, moderation queue, abuse policy and audited release workflow. Neither accounts nor P2P delivery are present.
