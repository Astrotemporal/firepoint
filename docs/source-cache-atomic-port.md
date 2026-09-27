# Draft: atomic source-cache commit port (no adapter)

Base: `staging/source-backed` at `792aad25fcd18d484207341e09b57d91e9b906b5`.
This is a contract proposal only. It does **not** apply migrations, connect to
Neon, ingest publisher data, poll, expose a route, or publish source data.

## Why the old port cannot be implemented as a durable adapter

The old `updateFetchAttemptResult`, `insertImmutableGeneration`, and
`markRetractedFromCompleteSnapshot` methods cross request/transaction boundaries.
Migration 0101 requires a successful attempt before inserting a generation.
That generation and its records can be inserted atomically with Neon HTTP's
`sql.transaction([...])`, but the attempt transition and subsequent retraction
were outside that transaction. A crash or losing worker could leave a success
without a generation or a complete generation whose missing prior records remain
current. In particular, `getLastGoodGeneration` existing by itself never
proves that `listCurrentRecords` reflects a fully applied complete snapshot.
Do not wire the old port to a database or public API.

## Proposed transaction boundary

`createFetchAttempt` inserts `started` with a scoped issuer-locked last-good
pointer. `commitCompleteSnapshot` must use **one** non-interactive PostgreSQL
transaction across all of these operations, in order:

1. Lock `(tenant_id, jurisdiction_id, issuer, source_registry_id)` registry row.
   Confirm storage rights, allowed kinds, `empty_ok` for empty snapshots, and
   a still-`started` attempt. Reject a changed latest complete-generation ID,
   changed last-good pointer, or non-next generation number as a stale conflict.
2. Transition the attempt to succeeded and insert the immutable generation.
3. Insert exactly `record_count` validated records; reject duplicate upstream
   IDs and mismatched provenance. Supersede current older records with IDs that
   occur in the new generation.
4. For a **complete** snapshot, derive missing IDs from *all* current older
   records absent from the committed generation. Retract all of them in this
   same transaction. Never trust a caller-supplied incomplete missing-ID list.
5. Commit only after deferred record-count constraints pass. Any error rolls
   back all five effects. A second overlapping commit must fail stale rather
   than rewrite a generation or advance a forked lineage.

`finishWithoutCompleteSnapshot` atomically transitions failed, skipped, or
incomplete attempts with no generation or retraction and unchanged last-good.
No partial success is promoted to a complete last-good snapshot. A future
review may propose a distinct atomic partial-generation method if needed.

The tagged `@neondatabase/serverless@1.1.0` HTTP query function advertises a
non-interactive PostgreSQL `transaction([...])`; it does not make separate
interface method calls atomic. A real adapter must exercise its exact transaction
on disposable PostgreSQL 17, including rollback, simultaneous competing commits,
zero rows, failure, scoped issuer mismatches, and stale reads. Existing CI's
`source-sql-integrity` job tests 0100/0101 SQL constraints and concurrency but
**does not test this proposed adapter**. Do not claim integration coverage.

## Read behavior

`getLastGoodGeneration` is a historical complete-source pointer, not a live
status. An expired `expiresAt`, stale `fetchedAt`, absent feed, or empty complete
snapshot means unavailable/last-synced or no-data, **never safe/all-clear**.
Every read and write requires tenant, jurisdiction, issuer, registry scoping;
Zod rejects invalid rows and scope mismatch. Neither a cached complete snapshot
nor a zero-row response authorizes an evacuation decision. No production
migration or source-rights approval is implied by this proposal.
