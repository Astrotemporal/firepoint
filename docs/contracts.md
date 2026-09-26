# Firepoint shared contract (v1)

This is a **new contract authored for Firepoint**, not the earlier Trigger Point model/scenario schema. The executable source of truth is [`src/domain/contracts.ts`](../src/domain/contracts.ts); its tests use conspicuously synthetic values and never reach the UI. Import Zod validators at network/storage boundaries and derive types with `z.infer`. There is no public reporting service, standing evacuation-zone lookup, GIS backend adapter, or official city partnership. The only present source adapter handles NWS point-filtered weather alerts and is not connected to the resident UI.

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

The route exists, but the resident UI does not call it and the NWS User-Agent is blank by default. Show **“Not checked”** with direct official links until a real user-initiated query succeeds. HTTP 404/501/503, transport failure, or malformed JSON is unavailable, *not* a synthetic empty feed. Synthetic fixtures belong only in `*.test.ts`.

## Source clocks and response behavior

`SourceCheckSchema` records `lastAttemptAt` separately from `lastSuccessAt`, the publisher's `sourceAsOf` if known, a source-specific `staleAfterSeconds`, applicability to this query, and a non-reassuring failure detail. `ok` requires an actual successful fetch; `stale` requires a real last-good record; `not-configured` and `down` need explanations. A status is about **one feed**, not the whole city. Never rewrite an upstream issue timestamp with our retrieval time.

The first server endpoint, `POST /api/v1/notices/query`, accepts `PlaceQuerySchema` and currently covers **only NWS weather alerts**. It uses `Cache-Control: no-store`, bounds the request and NWS timeout, and never echoes the queried point in the source-check URL. It returns 503 plus a typed `not-configured`/`down` state if no valid identifying NWS User-Agent is set or the upstream source fails. There is no durable last-good cache, rate-limit service, city evacuation adapter, or UI call yet; do not describe it as operational emergency coverage. Add source-specific caching, point-log redaction, abuse protection, and monitoring before public release. A future `GET /api/v1/source-health` can expose operational health without leaking user locations.

For UI teammate tasks: create loading, unavailable, stale, expired, outside-coverage, and verified-source views first. Do not import code from a model pipeline or fill an empty feed with demonstration numbers. Check the original link and exact text before any optional text-to-speech. For backend tasks: add adapters one publisher at a time, record license/jurisdiction/geography, test broken payloads and partial outages, and independently check the public display against the issuer. See [source policy](source-policy.md).

## Storage boundary

The installed service worker may cache the app shell and static guide, but never invents alert delivery. Small device-only preferences can use localStorage. If report drafts or bounded last-success notices are introduced, use versioned IndexedDB with explicit deletion, source timestamps and expiry; it is not secure storage on a shared phone. A public reporting system needs a separate durable database, moderation queue, abuse policy and audited release workflow. Neither accounts nor P2P delivery are present.
