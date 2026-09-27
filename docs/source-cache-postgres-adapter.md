# Draft PostgreSQL source-cache adapter

Base: `staging/source-backed` at `85867e4794873889e1c62ce18b57b26f504e1a4c`.
`src/server/source-cache-postgres.ts` is an **unwired server-only** adapter for
`SourceCacheStorage`. It neither configures a production database nor calls a
publisher, scheduler, browser route, report backend, or migration runner.

This uses Node `pg` with a caller-supplied `Pool`, not Neon HTTP. A single
pinned `PoolClient` holds the `BEGIN` / registry `FOR UPDATE` / attempt update /
generation + record inserts / supersessions + exhaustive missing-record
retractions / `COMMIT` sequence. Errors cause `ROLLBACK` before client release.
A generation cannot become visible before its records and retractions. The
0101 trigger guards and deferred record-count check are also required; apply
0100 and 0101 only to an **empty disposable test database**. Do not apply them
to a shared or production Neon database without a separate audited plan.

The adapter verifies issuer with a registry row lock and scopes database
queries by tenant, jurisdiction, registry ID, and issuer. A complete generation
must carry the exact registry source URL, but this only enforces stored lineage;
it does **not** authenticate a publisher or prove that its data were fetched.
The port's attempt value has no issuer field. The adapter receives a trusted
server-side scope; it is **not an authentication layer**. Verified caller
issuer authority and a vetted publisher URL/source allowlist are **hard
activation blockers** for any live adapter wiring or public route. There is
no route or composition factory in this draft.

`getLastGoodGeneration` returns historical provenance. It is **not** a live
status or all-clear. The potentially public-facing `listCurrentRecords` returns
records **only** when registry rights are `redistribution-approved`; storage-only
approval permits snapshot storage but does not permit readout through this port.
A complete commit also requires `validated-complete-for-scope` coverage before
any empty-result or missing-ID retraction. It returns only latest complete
snapshot records with strictly future generation
and provenance expiry. Null expiry or expired data are hidden, including standing
reference records until a separate reviewed freshness policy exists. Missing or malformed rows raise errors via
Zod rather than becoming a success state. Zero-row complete snapshots remain
`not-all-clear`; failed/incomplete attempts preserve last-good and do not
retract. Readers must still show source issue/update times and source-health
information before any future UI can display data; this draft has no UI.

CI runs the opt-in integration suite on disposable PostgreSQL 17 using synthetic
fixtures and 0100/0101. Local equivalent (only against your own disposable DB):
`SOURCE_CACHE_TEST_DATABASE_URL=postgres://... npx vitest run src/server/source-cache-postgres.integration.test.ts`.
It covers rollback after a later insert fails, stale concurrent commits,
issuer isolation, synthetic malformed stored data, failure preservation,
zero complete snapshot retraction, storage-only rights denial, denied partial/unverified
coverage, disallowed kinds, denied empty snapshots, forged registry URL, and
expired/null-TTL reads. Separate synthetic tests discard connections on failed
ROLLBACK/indeterminate COMMIT. It does not prove
hosted Neon TCP operation, publisher coverage/rights, or production readiness.
