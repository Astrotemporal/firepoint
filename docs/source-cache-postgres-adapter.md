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
queries by tenant, jurisdiction, registry ID, and issuer. The port's attempt
value has no issuer field. The adapter receives a trusted server-side scope;
it is **not an authentication layer**. Any future caller or route must verify
its authority to supply that issuer scope. There is no route or composition
factory in this draft.

`getLastGoodGeneration` returns historical provenance. It is **not** a live
status or all-clear. `listCurrentRecords` returns only latest complete snapshot
records with strictly future generation and provenance expiry. Null expiry or
expired data are hidden, including standing reference records until a separate
reviewed freshness policy exists. Missing or malformed rows raise errors via
Zod rather than becoming a success state. Zero-row complete snapshots remain
`not-all-clear`; failed/incomplete attempts preserve last-good and do not
retract. Readers must still show source issue/update times and source-health
information before any future UI can display data; this draft has no UI.

CI runs the opt-in integration suite on disposable PostgreSQL 17 using synthetic
fixtures and 0100/0101. Local equivalent (only against your own disposable DB):
`SOURCE_CACHE_TEST_DATABASE_URL=postgres://... npx vitest run src/server/source-cache-postgres.integration.test.ts`.
It covers rollback after a later insert fails, stale concurrent commits,
issuer isolation, synthetic malformed stored data, failure preservation,
zero complete snapshot retraction, and expired reads. It does not prove
hosted Neon TCP operation, publisher coverage/rights, or production readiness.
