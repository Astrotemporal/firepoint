# Draft source-cache foundation

This draft adds a non-UI foundation for future verified shelter and evacuation
records in Postgres. It is not a resident-report backend and it does not change
public UI behavior.

## Added pieces

- `src/domain/source-cache.ts`: pure Zod contracts for source registry, fetch
  attempts, immutable generations, source records, provenance, and retractions.
- `src/server/source-cache-storage.ts`: a server-side storage interface only.
- `db/migrations/0100_source_snapshots.sql`: a uniquely named migration for the
  source cache.
- `src/domain/source-cache.test.ts`: synthetic fixtures only. No real upstream
  calls run in CI.

## Migration ordering

The migration is named `0100_source_snapshots.sql` on purpose. Draft PR #34 uses
an early `0001_community_observations.sql` name and is not a dependency here.
This migration has no foreign keys, views, or joins to community observation or
resident report tables.

Apply after any accepted base app migrations. It can be applied whether or not a
future community-report backend exists.

## Safety rules encoded in the draft

- Every stored row has a strict `tenant_id` and `jurisdiction_id`.
- Wildcard scopes such as `all`, `global`, and `*` are rejected.
- `empty_ok` is explicit and always means `not-all-clear`.
- Failed fetches carry failure kind, message, and retryability.
- Last-good generation identifiers are stored separately from failures.
- `source_generation` rows are immutable.
- Retraction is allowed only from a complete snapshot.
- Third-party evacuation polygons and style order are not stored.
- `production_auto_polling_enabled` is fixed `false`.

## Candidate-source notes and blockers

### FEMA OpenShelters

Candidate endpoint:

`https://gis.fema.gov/arcgis/rest/services/NSS/OpenShelters/FeatureServer/0`

Manual 2026-09-27 note supplied for this draft: 0 Los Angeles County rows.
Coverage is incomplete. Per-record timestamps and storage/redistribution rights
remain unresolved. A zero-row response is not proof that shelters do not exist.

### LA County / Genasys public alert warning area

Candidate layer:

`Public_Emergency_Map_GENASYS_Alert_Warning_Area/FeatureServer/0`

Manual 2026-09-27 note supplied for this draft: 0 `GLN` rows. Issuer semantics,
retraction behavior, and Genasys polygon rights remain unresolved. Do not
persist, share, restyle, rank, or display those polygons until written approval
and positive-record validation exist.

### Glendale GIS MCP

Glendale GIS MCP is dated standing reference data, such as CAL FIRE/FEMA hazard
layers. It is not a live shelter, evacuation order, incident, or all-clear
source. If represented in this cache, use `standing-reference-snapshot` and keep
its vintage.

## Manual Preview probe gate

A manual Preview probe can be added only after all gates pass:

1. Written rights for storage and any redistribution are recorded.
2. Quotas, contact/user-agent rules, and acceptable use are documented.
3. Positive records validate the schema for the target jurisdiction.
4. Issuer and jurisdiction semantics are documented.
5. Retraction behavior from complete snapshots is documented.
6. Raw responses are stored only in an approved private operator location.
7. CI keeps using synthetic fixtures only.

If any gate fails, fail closed: mark `failed` or `skipped-gated`, keep the
previous last-good generation, do not retract from incomplete or failed data, and
link operators to the official source.

## Non-goals

No UI. No live adapter. No production poller. No secrets. No browser upstream
calls. No merge or deploy claim.

## Draft scope-integrity hardening (not deployed)

`db/migrations/0101_source_scope_integrity.sql` is a **forward-only proposal** after
0100. It has not been applied to any shared database. It binds registry,
generation, record-provenance issuer, and complete-generation references to a
single source/tenant/jurisdiction. It requires storage rights before a
successful generation and serializes a fetch attempt's initial last-good
pointer against generation creation. Failure/skip cannot advance that pointer;
incomplete generations remain available for source-health review but are never
last-good or allowed to retract records. The SQL rejects attempts to retract
an upstream ID that appears in the retracting complete generation and checks
generation record counts at transaction commit.

`SourceCacheStorage` now requires an explicit issuer-bearing scope on **every**
operation. No adapter exists. A future adapter must validate Zod at both read
and write boundaries, use one transaction for a generation and its records,
check the issuer against the source registry before each operation, and never
turn no-data/failure into an all-clear. The typed scope alone does not grant
authorization to a caller; an authenticated operator/service policy must bind
that scope before any route or worker can use the adapter.

`db/tests/source-scope-integrity.sql` contains synthetic Postgres negative
checks; it rolls back its fixtures. The GitHub Actions `source-sql-integrity`
job applies 0100 and 0101 to a disposable Postgres service, runs that fixture,
and checks a concurrent pair of successful fetches. It never contacts Neon.
A snapshot generation must be the next numbered generation and must still
point to the latest complete generation at **insert time**, not just at fetch
start. A retraction can use only the latest later complete generation; historic
rows and attempts cannot be deleted/reinserted to rewrite a snapshot. Registry
issuer inserts must have a nonblank, exact label (no surrounding ECMAScript
trim whitespace); the SQL CHECK remains active after migration preflight.

`source_registry.source_url` is the canonical registry endpoint or source page.
`source_generation.source_url` **may differ**: it is the HTTPS URL cited for
that specific published snapshot/vintage. Records must copy the generation's
URL and issuer exactly. The schema does **not** prove that a differing URL is
actually controlled by the issuer or covered by storage rights. A future
adapter must verify publisher URL lineage/allowlists and rights before it
writes, and must not use a plausible HTTPS URL alone as proof of authority.
The registry issuer must be the actual issuing authority, not an aggregator
name; multi-issuer feeds need separately verified issuer registries or a later
explicit multi-issuer contract. Never label the aggregator as an order issuer.

**0101 is not idempotent.** It is a one-time draft migration, not an app startup
script. Its preflight aborts if any fetch attempt, generation, or record already
exists, or if registry issuer labels are blank or padded. A database with such
rows requires a separately reviewed audit/backfill migration; do not re-run
0101 or work around the preflight. The synthetic CI test is not a production
migration approval. A future adapter still needs read/write Zod validation,
authorization, concurrency tests against its actual transactions, and rights
review before any shared database rollout.
No publisher feed, Neon connection, polling, UI, or community-report table is
involved. **This is not a durable source-cache implementation.**
