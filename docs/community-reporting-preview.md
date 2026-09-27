# Community reporting preview backend

**Status:** server API draft only. It is off by default. Do not enable it on public Production. Do not enable it on an anonymous Preview.

This backend accepts explicit resident observation submissions for a protected Vercel Preview test. It stores raw reports only in server-side Postgres/Neon. It publishes only the existing pure aggregate shape from `src/domain/observation-aggregate.ts`: coarse cells with `verification: "unverified"`, `allClear: false`, no raw report ids, no points, no text, and no per-report times.

It does **not** create a fire perimeter, evacuation order, blocked-road layer, safe route, agency status, or all-clear. It does **not** upload private FireMarks. There is no public UI in this server draft.

## Hard gates

The routes check these conditions before database access:

1. `FIREPOINT_REPORTING_ENABLED=preview-only`
2. `VERCEL_ENV=preview`
3. A server-only database URL exists.
4. Submit also requires `FIREPOINT_ABUSE_SALT`, `FIREPOINT_TRUSTED_IP_HEADER=x-vercel-forwarded-for`, `FIREPOINT_MODERATION_OWNER`, and `FIREPOINT_MODERATION_POLICY_VERSION`. Raw text/points are not accepted until a named moderation owner, policy, and trusted IP header are configured.
5. Moderation requires `FIREPOINT_MODERATOR_TOKEN` on the `Authorization: Bearer ...` header, and the posted `operatorName` must match `FIREPOINT_MODERATION_OWNER`. This binds audit identity to the configured owner; if one token is shared, the audit cannot distinguish which person used it.
6. Public aggregate publication requires `FIREPOINT_MODERATION_OWNER`, `FIREPOINT_MODERATION_POLICY_VERSION`, `FIREPOINT_MODERATION_AT` (real policy review/attestation time), and `FIREPOINT_REPORT_RIGHTS_REVIEWED=true`.
7. Manual/external Preview purge requires a dedicated `FIREPOINT_PURGE_TOKEN` on the `Authorization: Bearer ...` header. `CRON_SECRET` is not accepted; Vercel Cron targets Production, not the protected Preview route.

If any gate is missing, the route returns `503` or a withheld aggregate. This is intentional. Production must leave `FIREPOINT_REPORTING_ENABLED` unset, even if Neon attaches a database URL to Production.

A public or unprotected Preview is not safe for teammate reports. Ask the owner to enable Vercel Standard Protection for Preview first, or keep reporting disabled.

## Neon / Vercel setup

Use Vercel Marketplace Neon for Postgres.

Owner steps:

1. Confirm Production and Preview use separate Neon databases or branches. Do not infer separation from Vercel env scope. Ask Neon/Vercel to show the database/branch name for each environment.
2. In Vercel Preview env only, set the server-only database URL. Prefer `DATABASE_URL`. If Vercel generated `POSTGRES_URL` or `NEON_DATABASE_URL`, either map it to `DATABASE_URL` or leave it as generated; the code reads `DATABASE_URL`, then `POSTGRES_URL`, then `NEON_DATABASE_URL`. Never use `NEXT_PUBLIC_*` for any database value.
3. Apply `db/migrations/0001_community_observations.sql` to the Preview database/branch.
4. Choose and verify a retention purge path before collecting real teammate location data. Options:
   - External scheduled caller to the protected Preview URL with deployment bypass (if used) and dedicated `FIREPOINT_PURGE_TOKEN`, with observed successful deletion runs and an alert on missing/failed runs. Never point a Production Cron at this Preview route.
   - Owner-verified Neon Scheduled Function Trigger bound to the Preview branch. Neon docs say `pg_cron` runs only while compute is active, which is a poor fit for autosuspend/free-tier projects, while Scheduled Function Triggers are documented as branch-bound, UTC-cron scheduled functions with injected `DATABASE_URL`, scale-to-zero firing, and `x-neon-trigger-invocation-id` attestation. Free-plan availability and project access are unverified, so this is optional until owner confirms it and observes a deletion job run.
5. Set Preview-only server env:
   - `FIREPOINT_REPORTING_ENABLED=preview-only`
   - `FIREPOINT_TENANT_ID=glendale-preview`
   - `FIREPOINT_ABUSE_SALT=<random secret>`
   - `FIREPOINT_TRUSTED_IP_HEADER=x-vercel-forwarded-for` only after verifying this project has no Enterprise Trusted Proxy/custom ingress behavior that changes Vercel's documented request-header handling
   - `FIREPOINT_MODERATOR_TOKEN=<random secret>`
   - `FIREPOINT_PURGE_TOKEN=<random secret>` only for the protected `/api/v1/observations/purge` route; `CRON_SECRET` is intentionally not accepted, and neither token is needed for a Neon-side trigger that deletes directly in the Preview database
   - `FIREPOINT_MODERATION_OWNER=<named owner or role>`
   - `FIREPOINT_MODERATION_POLICY_VERSION=<reviewed policy version>`
   - `FIREPOINT_MODERATION_AT=<ISO timestamp of the actual moderation-policy attestation>`
   - `FIREPOINT_REPORT_RIGHTS_REVIEWED=true` only after consent, retention, takedown, reuse, privacy, and abuse review.
6. Leave all of the above unset in Production until a separate release review. A public Production site with `DATABASE_URL` must still return `503` for these routes.

## Routes

### `POST /api/v1/observations/submit`

Requires explicit JSON consent. Example payload for a protected Preview test:

```json
{
  "userInitiated": true,
  "topic": "smoke",
  "text": "Visible smoke from my block",
  "observedAt": null,
  "approximatePoint": [-118.24, 34.16],
  "precisionMeters": 800,
  "consent": {
    "submitObservation": true,
    "publishIfApproved": true,
    "retentionDays": 14
  },
  "website": ""
}
```

Success returns `202` with `disposition: "awaiting-moderation"` and `emergencyDispatch: false`. It does not mean publication or agency receipt.

Input is bounded to the Glendale preview coverage in `AGGREGATION_CONFIG`. This is coverage for a test service, not an evacuation zone. The JSON body is read through a streamed 2 KiB cap, so missing or spoofed `Content-Length` does not bypass the limit. Submitted coordinates are snapped to a grid at least as coarse as `precisionMeters` before storage; the backend does not store the original full-precision submitted point.

### `GET /api/v1/observations/moderation`

Requires `Authorization: Bearer $FIREPOINT_MODERATOR_TOKEN`. Returns pending raw reports for the moderator only. This endpoint must not be exposed without the token.

### `POST /api/v1/observations/moderation`

Requires a named operator and reason:

```json
{
  "receiptId": "00000000-0000-4000-8000-000000000001",
  "decision": "approved",
  "operatorName": "Casey Moderator",
  "reason": "Within preview policy"
}
```

The decision and audit row are written together. Reports can be `pending`, `approved`, or `rejected`. The submitted `operatorName` must match `FIREPOINT_MODERATION_OWNER`; a shared bearer token is still a shared identity and is a blocker for stronger person-level auditing.

### `GET /api/v1/observations/aggregate`

Returns `200` only when there is a publishable aggregate: at least three approved, unverified observations in a coarse cell/time/topic group and all moderation/rights gates are configured. `FIREPOINT_MODERATION_AT` must be a real ISO timestamp of the policy review; the route does not synthesize the attestation time from the request clock. Otherwise it returns `503` with a withheld aggregate or an error.

The public aggregate never includes raw ids, points, text, reporter hashes, exact per-report times, or private audit details.

### `POST /api/v1/observations/purge`

Protected purge endpoint for manual owner use or an external scheduler that can call the protected Preview deployment. It requires Preview reporting gates plus `Authorization: Bearer $FIREPOINT_PURGE_TOKEN`; `CRON_SECRET` is not accepted. Each request deletes at most 1,000 expired reports and 1,000 old rate-limit buckets in one atomic database statement. Its `deleted`, `rateBucketsDeleted`, and `moreMayRemain` fields report that single pass only. If `moreMayRemain` is true, call it again until false; a false value does not replace a future scheduled run, and a `200` does not prove a scheduler exists. Without an observed, monitored scheduled caller, retention cleanup does not run reliably. Configure and demonstrate deletion through an external scheduler that can call the protected Preview URL, or a verified Neon-side scheduled delete, before enabling teammate report collection. Vercel Cron runs against Production only and would hit this Preview-gated route as `503`, so it is not sufficient.

Optional owner-verify path: a Neon Scheduled Function Trigger on the Preview branch may perform the deletion inside Neon without a Vercel Preview bypass. Neon docs say `pg_cron` only runs while compute is active, which is bad for autosuspend/free-tier expectations; Neon Scheduled Function Triggers are documented as branch-bound, UTC-cron scheduled functions with injected `DATABASE_URL`, scale-to-zero firing, and `x-neon-trigger-invocation-id` attestation. Free-plan availability and access in this project are unverified. Do not treat this as configured until the owner observes a successful deletion job run against Preview data.

## Abuse, rate limits, and retention

- Durable rate limits are stored in `community_observation_rate_limits` by tenant, bucket key, and one-hour window.
- There are two buckets: a cookie/IP/user-agent combination capped at 5/hour and an independent IP bucket capped at 20/hour. The IP bucket uses only the configured trusted header (`FIREPOINT_TRUSTED_IP_HEADER=x-vercel-forwarded-for`) and does not fall back to plain `X-Forwarded-For`. Vercel documents that `x-forwarded-for` is the client public IP, and that Vercel overwrites it and does not forward external IPs to prevent spoofing; `x-vercel-forwarded-for` has the same value and is protected from an extra proxy overwriting `x-forwarded-for` ([Vercel request headers](https://vercel.com/docs/headers/request-headers)). Owner must still verify this project has no Enterprise Trusted Proxy/custom ingress behavior before setting the env. Until then, this is a test blocker. These limits reduce abuse only. They do not prevent Sybil attacks. The anonymous cookie is not a person and cannot prove distinct humans.
- Raw reports expire after 14 days by `expires_at`. The public aggregate only considers observations within the aggregation contract maximum age of 7 days. Only the protected purge route or a verified Neon-side scheduled delete runs cleanup for expired reports and old rate-limit rows. The route batches cleanup and deletes both table types in one atomic statement, but cannot ensure a future call or demonstrate retention compliance by itself. Configure an external scheduled purge that can reach the protected Preview deployment, or a verified Neon Scheduled Function Trigger / other Neon-side scheduled delete, before enabling teammate reports. Vercel Cron runs against Production only and is not sufficient for this Preview-gated route. Neon `pg_cron` is not preferred for autosuspend/free-tier expectations because Neon documents that it only runs while compute is active. Audit rows currently cascade-delete with expired raw observations; this keeps retention short but loses long-term moderation history. Change that policy before any launch that requires durable audit retention.
- `tenant_id` is required on all tables. This supports future municipalities without mixing data. The approved-observation query has a 10,000-row safety cap and fails closed instead of silently undercounting if the cap is exceeded.

## Test expectations

CI uses fake stores and synthetic data only. It must not require a real database URL, Neon key, Mapbox key, or agency API key. SQL-shape tests do not replace an owner-approved Preview database integration test. Idempotent duplicate-submit receipts are **not implemented**: each successful retry creates a new UUID and the two rate-limit counters run before the insert, so a lost response can lead to duplicate reports or a retry blocked by 429. Do not add a non-atomic receipt pre-check or treat client-supplied IDs as trusted. A unique database key, payload conflict policy, atomic receipt/rate-limit transaction, retention policy for keys, and synthetic concurrency tests are required before any public input UI; that design still needs owner review. This purge hardening does not permit report collection.

Useful checks:

```bash
npm test -- src/server/observations.test.ts src/app/api/v1/observations/submit/route.test.ts src/domain/observation-aggregate.test.ts
make check
npm audit
```
