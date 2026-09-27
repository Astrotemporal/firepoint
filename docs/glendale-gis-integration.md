# Glendale GIS MCP integration: bounds, wiring and blockers

**Status:** server-only adapter with tests; **production queries stay paused.** This page states what the adapter does and does not do, how local and hosted wiring differ, and what must happen before a deliberate production rollout. It is not a rollout plan or an approval.

## Upstream contract (pinned)

The adapter targets [HackerFund/GlendaleGisMcp](https://github.com/HackerFund/GlendaleGisMcp) at commit `59beb3409a7f3c5db8fbab79075ba646b8082386` (the `.mcp.json` and `Makefile` pin) with snapshot release `snapshot-20260926`. Verified there, not on a moving `main`:

- Hosted transport: stateless MCP streamable HTTP at `/mcp`; `/health` is open. Auth is `Authorization: Bearer <key>`; a missing or wrong key is `401`. A sliding-window limit (default 120 per minute per key or client address) answers `429` with `Retry-After`. The server caps request bodies at 4 MiB.
- Tool: `tools/call` with `name: "hazards_at_location"`, arguments `{ "location": { "lat", "lon" } }`. The result carries the same JSON in `content[0].text` and `structuredContent`, with keys `location, wildfire, flood, fault, liquefaction, landslide, dam_inundation, debris_flow`; each layer has `status: in_zone | not_in_zone | unavailable`, `matches`, `notes`, `disclaimer` and `_meta` (`source`, `url`, `as_of`, `stale`, `source_last_edit`).
- Nothing in this repository's CI calls the hosted server, and no test uses a real key.

## Exact request and response bounds (`src/server/glendale-gis.ts`)

| Bound | Value | Behaviour when exceeded |
| --- | --- | --- |
| Client body accepted by `POST /api/v1/hazards/query` | `1024` bytes, `application/json` only, `PlaceQuerySchema` with `userInitiated: true` | `413`, `415` or `400`; no upstream request |
| Upstream requests per lookup | exactly `1` fixed `tools/call` (about 150 bytes) | never retried, never followed |
| Redirects | `redirect: "manual"`; any `3xx` or opaque redirect | `down`, reason `redirected`; the key is not re-sent anywhere |
| Accepted reply media types | `application/json`, `text/event-stream` (parameters ignored, case-insensitive) | `down`, reason `bad_content_type` |
| Reply size (`GIS_MAX_RESPONSE_BYTES`) | `1,048,576` bytes (1 MiB), checked against `Content-Length` first and then counted while streaming | `down`, reason `oversize`; the rest of the body is cancelled, never partially parsed |
| Whole-call timeout (`GIS_DEFAULT_TIMEOUT_MS`) | `10,000` ms covering connect, headers and body read | `down`, reason `timeout` |
| JSON-RPC reply id | must equal the request id (JSON and event-stream) | `down`, reason `invalid_response` |
| `401`/`403`, `429` | mapped to `unauthorized`, `rate_limited` (with a bounded `Retry-After` of 1 to 3600 s when present) | `down` with a named detail |

Why 1 MiB: a full seven-layer reply with nearest-zone attributes from the pinned server is tens of kilobytes; 1 MiB is an order of magnitude of headroom while stopping a broken or hostile upstream from filling a serverless function's memory. Every failure is `status: "down"` with `hazards: []` and `allClear: false`; the feed never turns an outage, a redirect or a truncated answer into "not in a zone".

## Where the function's upstream call goes

The browser only ever calls the app-owned route. The route's server code chooses the upstream from `GLENDALE_GIS_MCP_URL` and `GLENDALE_GIS_MCP_KEY`, which are server env only.

| Runtime | `NODE_ENV` | Gate `FIREPOINT_DEMO_LIVE_SOURCES=enabled` | Upstream |
| --- | --- | --- | --- |
| `next dev` on your machine (`.env.local`) | `development` | honoured | whatever the URL says; for local work use `http://127.0.0.1:8765/mcp` with the **synthetic stub** (`npm run gis:stub`) or the **real pinned server** (`npm run gis:local`, needs `uv`). Plain HTTP is accepted only for `127.0.0.1`/`localhost`. |
| `vercel dev` (local emulation) | `development` | honoured | same as above; the function runs on your machine and reaches your loopback stub |
| CI `npm run gis:smoke` | `development` then `production` | set on purpose | loopback stub only; the production half must answer `503 paused` with zero stub calls |
| Vercel Preview / Production function | `production` | **ignored: always paused** | would be the hosted Cloud Run MCP over HTTPS using the Vercel-stored key, but the route returns `503` before any request is built |

There is no reason to host an MCP server inside Vercel. A production function would call the separately operated Cloud Run service over HTTPS with the server-side key; the loopback stub and `gis:local` exist only so the wiring can be exercised without that key.

The stub (`scripts/gis-mcp-stub.mjs`) labels every title, source and caveat `SYNTHETIC`, holds no snapshot, binds loopback only, and must not be used for demos, screenshots or anything resident-facing. Its paths (`/mcp/redirect`, `/mcp/oversize`, `/mcp/hang`, ...) reproduce upstream misbehaviour for `src/server/glendale-gis.stub.test.ts` and `scripts/gis-stub-smoke.mjs`.

## Blockers before a deliberate production rollout

Turning the production gate on is a deliberate, reviewed decision, not a flag flip. The following are unresolved; the adapter bounds above do not resolve them.

1. **Rate limiting on our side.** The upstream limit is per key, and Firepoint's single key is shared by every resident. There is no per-client limiter, queue or circuit breaker in this repository; one busy page could exhaust the shared quota and every resident would see `rate_limited`.
2. **Durable quota and caching.** No cache, last-good record, or attempt/success ledger exists. A Vercel function alone cannot provide dependable scheduled ingest, a durable quota, or health monitoring; see [pwa-storage-and-systems.md](pwa-storage-and-systems.md).
3. **`userInitiated: true` is not proof of a human action.** It is a client-supplied boolean that any script can set. It expresses intent for the contract and blocks accidental background polling, nothing more. Abuse control needs server-side limits and monitoring, not this flag.
4. **Privacy.** The route forwards the queried coordinate to a third-party server. Location rounding, retention on the upstream side, and resident-facing disclosure are not reviewed.
5. **Source rights and attribution.** The upstream server code is GPL-3.0-or-later; each agency layer (CAL FIRE, FEMA, CGS, DWR, USGS) has separate reuse and attribution terms that still need the per-source review in [source-policy.md](source-policy.md).
6. **Operational ownership.** The hosted MCP is a hackathon service with no availability commitment. A resident-facing feature needs a named operator, a staleness policy tied to `snapshotAsOf`, and an incident plan for `down`.

## Checks that run

- `npm test` includes injected-fetcher unit tests and the loopback stub tests (oversize declared and streamed, redirects, content type, timeouts, 401/429, single call, route gating).
- `npm run gis:smoke` (also in CI after `npm run build`) boots `next dev` and `next start` against the stub. It fails if a production build makes any upstream call.
- `make gis-health` only checks public reachability of the hosted `/health`; it sends no key and is not part of CI.
