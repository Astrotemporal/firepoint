import "server-only";
import { Pool, type PoolClient } from "pg";
import {
  SourceFetchAttemptSchema, SourceGenerationSchema, SourceIssuerScopeSchema, SourceRecordSchema,
  SourceRegistrySchema, assertFetchAttemptTransition, type SourceFetchAttempt,
  type SourceGeneration, type SourceIssuerScope, type SourceRecord, type SourceRegistry,
} from "@/domain/source-cache";
import {
  assertCompleteSnapshotCommit, assertNonCompleteAttempt,
  type CompleteSnapshotCommit, type SourceCacheStorage,
} from "./source-cache-storage";

// The pool is supplied by server-only composition, never opened by import or a route.
// pg uses one pinned client per BEGIN/COMMIT; no Neon HTTP multi-call illusion.
type Row = Record<string, unknown>;
const iso = (value: unknown) => value instanceof Date ? value.toISOString() : value;
const camel = (row: Row): Row => Object.fromEntries(Object.entries(row).map(([key, value]) =>
  [key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()), iso(value)]));
const one = (rows: Row[]): Row => {
  if (rows.length !== 1 || !rows[0]) throw new Error("expected exactly one issuer-scoped source row");
  return rows[0];
};
const failure = (row: Row) => row.failure_kind === null ? null : {
  kind: row.failure_kind, message: row.failure_message, retryable: row.failure_retryable,
};
const registryRow = (row: Row): SourceRegistry => SourceRegistrySchema.parse(camel(row));
const attemptRow = (row: Row): SourceFetchAttempt => SourceFetchAttemptSchema.parse({ ...camel(row), failure: failure(row) });
const generationRow = (row: Row): SourceGeneration => SourceGenerationSchema.parse(camel(row));
const recordRow = (row: Row): SourceRecord => SourceRecordSchema.parse({
  ...camel(row), point: row.point_longitude === null && row.point_latitude === null ? null :
    { longitude: row.point_longitude, latitude: row.point_latitude },
  provenance: {
    issuer: row.provenance_issuer, sourceUrl: row.provenance_source_url,
    sourceVintage: row.provenance_source_vintage, sourceIssuedAt: iso(row.provenance_source_issued_at),
    fetchedAt: iso(row.provenance_fetched_at), expiresAt: iso(row.provenance_expires_at),
    completeSnapshot: row.provenance_complete_snapshot, lastGoodGenerationId: row.provenance_last_good_generation_id,
    fetchFailure: row.provenance_fetch_failure_kind === null ? null : {
      kind: row.provenance_fetch_failure_kind, message: row.provenance_fetch_failure_message,
      retryable: row.provenance_fetch_failure_retryable,
    },
  },
});
const scope = (input: SourceIssuerScope) => SourceIssuerScopeSchema.parse(input);
const registryId = (input: string) => SourceRegistrySchema.shape.id.parse(input);
const scopeArgs = (s: SourceIssuerScope, id: string) => [id, s.tenantId, s.jurisdictionId, s.issuer];
const latestSql = `select g.* from source_generation g join source_registry r
  on r.id=g.source_registry_id and r.tenant_id=g.tenant_id and r.jurisdiction_id=g.jurisdiction_id
  and r.issuer=g.issuer where g.source_registry_id=$1 and g.tenant_id=$2 and g.jurisdiction_id=$3
  and g.issuer=$4 and g.complete_snapshot=true order by g.generation_number desc limit 1`;

export class PostgresSourceCacheStorage implements SourceCacheStorage {
  constructor(private readonly pool: Pool) {}
  private async transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    let begun = false;
    let committing = false;
    let discard = false;
    try {
      await client.query("BEGIN");
      begun = true;
      const result = await operation(client);
      committing = true;
      await client.query("COMMIT");
      begun = false;
      return result;
    } catch (error) {
      // COMMIT transport failure has indeterminate outcome; do not claim rollback.
      // Never reuse that client or a connection whose ROLLBACK fails.
      if (committing || !begun) {
        discard = true;
        throw error;
      }
      try { await client.query("ROLLBACK"); }
      catch (rollbackError) {
        discard = true;
        throw new AggregateError([error, rollbackError], "source transaction failed and rollback failed");
      }
      throw error;
    } finally { client.release(discard); }
  }
  private async lockedRegistry(client: PoolClient, s: SourceIssuerScope, id: string): Promise<SourceRegistry> {
    const found = await client.query<Row>(`select * from source_registry where id=$1 and tenant_id=$2
      and jurisdiction_id=$3 and issuer=$4 for update`, scopeArgs(s, id));
    return registryRow(one(found.rows));
  }
  async getRegistry(input: SourceIssuerScope, id: string): Promise<SourceRegistry | null> {
    const s = scope(input);
    const result = await this.pool.query<Row>(`select * from source_registry where id=$1 and tenant_id=$2
      and jurisdiction_id=$3 and issuer=$4`, scopeArgs(s, registryId(id)));
    if (result.rows.length > 1) throw new Error("duplicate scoped registry");
    return result.rows[0] ? registryRow(result.rows[0]) : null;
  }
  async listRegistries(input: SourceIssuerScope): Promise<readonly SourceRegistry[]> {
    const s = scope(input);
    const result = await this.pool.query<Row>(`select * from source_registry where tenant_id=$1
      and jurisdiction_id=$2 and issuer=$3 order by id limit 10001`, [s.tenantId, s.jurisdictionId, s.issuer]);
    if (result.rows.length > 10000) throw new Error("registry read exceeded safety cap");
    return result.rows.map(registryRow);
  }
  async getLastGoodGeneration(input: SourceIssuerScope, id: string): Promise<SourceGeneration | null> {
    const s = scope(input);
    const result = await this.pool.query<Row>(latestSql, scopeArgs(s, registryId(id)));
    // This is historical provenance, not a freshness or all-clear verdict.
    return result.rows[0] ? generationRow(result.rows[0]) : null;
  }
  async listCurrentRecords(input: SourceIssuerScope, id: string): Promise<readonly SourceRecord[]> {
    const s = scope(input);
    const result = await this.pool.query<Row>(`select rec.* from source_record rec join source_registry r
      on r.id=rec.source_registry_id and r.tenant_id=rec.tenant_id and r.jurisdiction_id=rec.jurisdiction_id
      and r.issuer=rec.provenance_issuer join source_generation g on g.id=rec.generation_id
      and g.source_registry_id=rec.source_registry_id and g.tenant_id=rec.tenant_id
      and g.jurisdiction_id=rec.jurisdiction_id and g.issuer=rec.provenance_issuer
      where rec.source_registry_id=$1 and rec.tenant_id=$2 and rec.jurisdiction_id=$3
      and rec.provenance_issuer=$4 and r.rights_status='redistribution-approved'
      and rec.status='current' and g.complete_snapshot=true
      and rec.provenance_expires_at > now() and g.expires_at > now()
      and g.id = (select latest.id from source_generation latest where latest.source_registry_id=$1
        and latest.tenant_id=$2 and latest.jurisdiction_id=$3 and latest.issuer=$4
        and latest.complete_snapshot=true order by latest.generation_number desc limit 1)
      order by rec.id limit 10001`, scopeArgs(s, registryId(id)));
    if (result.rows.length > 10000) throw new Error("record read exceeded safety cap");
    return result.rows.map(recordRow);
  }
  async createFetchAttempt(input: SourceIssuerScope, value: SourceFetchAttempt): Promise<void> {
    const s = scope(input), a = SourceFetchAttemptSchema.parse(value);
    if (a.tenantId !== s.tenantId || a.jurisdictionId !== s.jurisdictionId ||
      a.status !== "started" || a.completedAt !== null || a.failure !== null ||
      a.completeSnapshot || a.rowsSeen !== 0 || a.rowsAccepted !== 0)
      throw new Error("invalid initial scoped fetch attempt");
    await this.transaction(async (client) => {
      await this.lockedRegistry(client, s, a.sourceRegistryId);
      const result = await client.query<Row>(`insert into source_fetch_attempt
        (id,source_registry_id,tenant_id,jurisdiction_id,status,started_at,completed_at,
        upstream_request_url,http_status,rows_seen,rows_accepted,complete_snapshot,empty_ok,
        last_good_generation_id,failure_kind,failure_message,failure_retryable)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,null,null,null) returning *`,
      [a.id,a.sourceRegistryId,s.tenantId,s.jurisdictionId,a.status,a.startedAt,a.completedAt,
        a.upstreamRequestUrl,a.httpStatus,a.rowsSeen,a.rowsAccepted,a.completeSnapshot,
        a.emptyOk,a.lastGoodGenerationId]);
      attemptRow(one(result.rows));
    });
  }
  private async transition(client: PoolClient, s: SourceIssuerScope, a: SourceFetchAttempt): Promise<void> {
    const existing = await client.query<Row>(`select a.* from source_fetch_attempt a join source_registry r
      on r.id=a.source_registry_id and r.tenant_id=a.tenant_id and r.jurisdiction_id=a.jurisdiction_id
      where a.id=$1 and a.source_registry_id=$2 and a.tenant_id=$3 and a.jurisdiction_id=$4
      and r.issuer=$5 for update`, [a.id,a.sourceRegistryId,s.tenantId,s.jurisdictionId,s.issuer]);
    const previous = attemptRow(one(existing.rows));
    // pg parses timestamptz to canonical ISO milliseconds. Normalize equivalent
    // Zod-valid input instants before the domain transition compares strings.
    const normalized = SourceFetchAttemptSchema.parse({ ...a,
      startedAt: new Date(a.startedAt).toISOString(),
      completedAt: a.completedAt === null ? null : new Date(a.completedAt).toISOString(),
    });
    assertFetchAttemptTransition(previous, normalized);
    const result = await client.query<Row>(`update source_fetch_attempt set status=$1,completed_at=$2,
      upstream_request_url=$3,http_status=$4,rows_seen=$5,rows_accepted=$6,complete_snapshot=$7,
      empty_ok=$8,failure_kind=$9,failure_message=$10,failure_retryable=$11
      where id=$12 and source_registry_id=$13 and tenant_id=$14 and jurisdiction_id=$15
      and status='started' and started_at=$16 and last_good_generation_id is not distinct from $17::uuid
      returning *`, [a.status,a.completedAt,a.upstreamRequestUrl,a.httpStatus,a.rowsSeen,a.rowsAccepted,
      a.completeSnapshot,a.emptyOk,a.failure?.kind ?? null,a.failure?.message ?? null,
      a.failure?.retryable ?? null,a.id,a.sourceRegistryId,s.tenantId,s.jurisdictionId,
      a.startedAt,a.lastGoodGenerationId]);
    assertFetchAttemptTransition(previous, attemptRow(one(result.rows)));
  }
  async finishWithoutCompleteSnapshot(input: SourceIssuerScope, value: SourceFetchAttempt): Promise<void> {
    const s = scope(input), a = assertNonCompleteAttempt(s, value);
    await this.transaction(async (client) => {
      await this.lockedRegistry(client, s, a.sourceRegistryId);
      await this.transition(client, s, a);
    });
  }
  async commitCompleteSnapshot(input: SourceIssuerScope, value: CompleteSnapshotCommit): Promise<void> {
    const s = scope(input), { attempt: a, generation: g, records } = assertCompleteSnapshotCommit(s, value);
    await this.transaction(async (client) => {
      const registry = await this.lockedRegistry(client, s, g.sourceRegistryId);
      if (registry.rightsStatus !== "storage-approved" && registry.rightsStatus !== "redistribution-approved")
        throw new Error("source storage rights not approved");
      // A partial/unverified registry cannot claim exhaustive omission or empty
      // retraction even if the attempt payload asserts completeSnapshot=true.
      if (registry.coverageStatus !== "validated-complete-for-scope")
        throw new Error("complete snapshot requires validated registry coverage");
      // Registry identity is immutable for issuer/scope; exact stored URL is
      // required too. This is lineage consistency, NOT source authentication.
      if (g.sourceUrl !== registry.sourceUrl)
        throw new Error("source generation URL differs from registry");
      if (records.some((record) => !registry.recordKinds.includes(record.kind)) ||
        (records.length === 0 && (!a.emptyOk || !registry.emptyOk)))
        throw new Error("source kind or empty snapshot not approved");
      const latest = await client.query<Row>(latestSql, scopeArgs(s, g.sourceRegistryId));
      const last = latest.rows[0] ? generationRow(latest.rows[0]) : null;
      if (last?.id !== (g.previousCompleteGenerationId ?? undefined)) throw new Error("stale complete snapshot");
      const next = await client.query<{ next_number: number }>(`select coalesce(max(generation_number),0)+1 as next_number
        from source_generation where source_registry_id=$1 and tenant_id=$2 and jurisdiction_id=$3
        and issuer=$4`, scopeArgs(s, g.sourceRegistryId));
      if (next.rows[0]?.next_number !== g.generationNumber) throw new Error("stale generation number");
      await this.transition(client, s, a);
      const inserted = await client.query<Row>(`insert into source_generation
        (id,source_registry_id,fetch_attempt_id,tenant_id,jurisdiction_id,generation_number,
        issuer,source_url,source_vintage,source_issued_at,fetched_at,expires_at,record_count,
        complete_snapshot,empty_result_meaning,previous_complete_generation_id,created_at)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) returning *`,
      [g.id,g.sourceRegistryId,g.fetchAttemptId,s.tenantId,s.jurisdictionId,g.generationNumber,
        g.issuer,g.sourceUrl,g.sourceVintage,g.sourceIssuedAt,g.fetchedAt,g.expiresAt,g.recordCount,
        g.completeSnapshot,g.emptyResultMeaning,g.previousCompleteGenerationId,g.createdAt]);
      generationRow(one(inserted.rows));
      for (const r of records) {
        const stored = await client.query<Row>(`insert into source_record
          (id,source_registry_id,generation_id,tenant_id,jurisdiction_id,upstream_record_id,kind,status,
          name,description,location_text,point_longitude,point_latitude,provenance_issuer,
          provenance_source_url,provenance_source_vintage,provenance_source_issued_at,
          provenance_fetched_at,provenance_expires_at,provenance_complete_snapshot,
          provenance_last_good_generation_id,provenance_fetch_failure_kind,
          provenance_fetch_failure_message,provenance_fetch_failure_retryable,retracted_by_generation_id,created_at)
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,
          null,null,null,null,$22) returning *`,
        [r.id,r.sourceRegistryId,r.generationId,s.tenantId,s.jurisdictionId,r.upstreamRecordId,
          r.kind,r.status,r.name,r.description,r.locationText,r.point?.longitude ?? null,
          r.point?.latitude ?? null,r.provenance.issuer,r.provenance.sourceUrl,
          r.provenance.sourceVintage,r.provenance.sourceIssuedAt,r.provenance.fetchedAt,
          r.provenance.expiresAt,r.provenance.completeSnapshot,r.provenance.lastGoodGenerationId,r.createdAt]);
        recordRow(one(stored.rows));
      }
      // No caller-supplied omissions: the committed generation itself determines
      // which older current records remain present and which must be retracted.
      const superseded = await client.query<Row>(`update source_record old set status='superseded'
        where old.source_registry_id=$1 and old.tenant_id=$2 and old.jurisdiction_id=$3
        and old.provenance_issuer=$4 and old.status='current' and old.generation_id<>$5
        and exists (select 1 from source_record fresh where fresh.generation_id=$5
          and fresh.source_registry_id=$1 and fresh.tenant_id=$2 and fresh.jurisdiction_id=$3
          and fresh.provenance_issuer=$4 and fresh.upstream_record_id=old.upstream_record_id)
        returning *`, [...scopeArgs(s,g.sourceRegistryId),g.id]);
      superseded.rows.forEach(recordRow);
      const retracted = await client.query<Row>(`update source_record old set status='retracted',
        retracted_by_generation_id=$5 where old.source_registry_id=$1 and old.tenant_id=$2
        and old.jurisdiction_id=$3 and old.provenance_issuer=$4 and old.status='current'
        and old.generation_id<>$5 and not exists (select 1 from source_record fresh
          where fresh.generation_id=$5 and fresh.source_registry_id=$1 and fresh.tenant_id=$2
          and fresh.jurisdiction_id=$3 and fresh.provenance_issuer=$4
          and fresh.upstream_record_id=old.upstream_record_id) returning *`,
      [...scopeArgs(s,g.sourceRegistryId),g.id]);
      retracted.rows.forEach(recordRow);
    });
  }
}
