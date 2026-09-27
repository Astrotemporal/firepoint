import {
  SourceFetchAttemptSchema, SourceGenerationSchema, SourceIssuerScopeSchema, SourceRecordSchema,
  assertSourceIssuerScope, type SourceFetchAttempt, type SourceGeneration, type SourceRecord,
  type SourceRegistry, type SourceIssuerScope,
} from "@/domain/source-cache";

/**
 * Server-only proposal. No implementation or application route uses this port.
 *
 * A successful complete snapshot MUST commit the attempt transition, immutable
 * generation, every record, supersession of matching current records, and
 * retraction of ALL current records absent from this complete snapshot in ONE
 * database transaction. Retractions must be derived from the committed record
 * set, not a caller-supplied optional list that could silently omit an ID.
 * The generation is not visible before the records and lifecycle changes commit.
 *
 * Lock the issuer-scoped source registry row before checking the started
 * attempt's last-good pointer and latest generation. A competing snapshot that
 * changes that pointer/number must cause rollback and a stale-attempt error;
 * never retry with a rewritten generation or silently fork lineage. A failed,
 * skipped, or incomplete attempt transitions in one atomic update and must not
 * create a generation, retract records, or advance last-good.
 *
 * A complete zero-row snapshot requires the registry's explicit emptyOk and
 * means NOT ALL CLEAR. Even a fresh complete snapshot is source data, not a
 * safety verdict. Readers must treat expiry/staleness as unavailable, never
 * "safe". A null/invalid row must fail closed via Zod before returning data.
 */
export interface SourceCacheStorage {
  getRegistry(scope: SourceIssuerScope, sourceRegistryId: string): Promise<SourceRegistry | null>;
  listRegistries(scope: SourceIssuerScope): Promise<readonly SourceRegistry[]>;
  createFetchAttempt(scope: SourceIssuerScope, attempt: SourceFetchAttempt): Promise<void>;
  commitCompleteSnapshot(scope: SourceIssuerScope, input: CompleteSnapshotCommit): Promise<void>;
  finishWithoutCompleteSnapshot(scope: SourceIssuerScope, attempt: SourceFetchAttempt): Promise<void>;
  getLastGoodGeneration(scope: SourceIssuerScope, sourceRegistryId: string): Promise<SourceGeneration | null>;
  listCurrentRecords(scope: SourceIssuerScope, sourceRegistryId: string): Promise<readonly SourceRecord[]>;
}

export type CompleteSnapshotCommit = {
  attempt: SourceFetchAttempt;
  generation: SourceGeneration;
  records: readonly SourceRecord[];
};

/** Validate the full payload BEFORE opening a transaction; database constraints
 * and a scoped serializing row lock must re-check persisted state at commit. */
export function assertCompleteSnapshotCommit(scope: SourceIssuerScope, input: CompleteSnapshotCommit): CompleteSnapshotCommit {
  const issuerScope = SourceIssuerScopeSchema.parse(scope);
  const attempt = SourceFetchAttemptSchema.parse(input.attempt);
  const generation = SourceGenerationSchema.parse(input.generation);
  const records = input.records.map((record) => SourceRecordSchema.parse(record));
  // Fetch attempts have no issuer field. Copying issuer from scope would NOT
  // authenticate it. The adapter must verify the caller's authority and lock
  // the matching issuer-bearing registry row in the same transaction.
  if (attempt.tenantId !== issuerScope.tenantId || attempt.jurisdictionId !== issuerScope.jurisdictionId) {
    throw new Error("source-cache attempt scope mismatch");
  }
  assertSourceIssuerScope(issuerScope, generation);
  if (attempt.completedAt === null || Date.parse(attempt.completedAt) < Date.parse(attempt.startedAt) ||
      attempt.status !== (records.length === 0 ? "succeeded-empty" : "succeeded-non-empty") ||
      !attempt.completeSnapshot || !generation.completeSnapshot ||
      attempt.sourceRegistryId !== generation.sourceRegistryId || generation.fetchAttemptId !== attempt.id ||
      generation.previousCompleteGenerationId !== attempt.lastGoodGenerationId ||
      attempt.rowsAccepted !== records.length || generation.recordCount !== records.length ||
      (records.length === 0 && !attempt.emptyOk)) {
    throw new Error("invalid complete source snapshot");
  }
  const upstreamIds = new Set<string>();
  for (const record of records) {
    assertSourceIssuerScope(issuerScope, { ...record, issuer: record.provenance.issuer });
    if (record.generationId !== generation.id || record.sourceRegistryId !== generation.sourceRegistryId ||
        record.status !== "current" || record.retractedByGenerationId !== null ||
        record.provenance.sourceUrl !== generation.sourceUrl ||
        record.provenance.sourceVintage !== generation.sourceVintage ||
        record.provenance.sourceIssuedAt !== generation.sourceIssuedAt ||
        record.provenance.fetchedAt !== generation.fetchedAt ||
        record.provenance.expiresAt !== generation.expiresAt ||
        record.provenance.completeSnapshot !== true ||
        record.provenance.lastGoodGenerationId !== generation.previousCompleteGenerationId ||
        record.provenance.fetchFailure !== null || upstreamIds.has(record.upstreamRecordId)) {
      throw new Error("invalid source snapshot record or provenance");
    }
    upstreamIds.add(record.upstreamRecordId);
  }
  return { attempt, generation, records };
}

export function assertNonCompleteAttempt(scope: SourceIssuerScope, input: SourceFetchAttempt): SourceFetchAttempt {
  const issuerScope = SourceIssuerScopeSchema.parse(scope);
  const attempt = SourceFetchAttemptSchema.parse(input);
  // No issuer is present on attempt rows. Only the future adapter can check
  // caller authority and the locked registry's issuer; this checks scope only.
  if (attempt.tenantId !== issuerScope.tenantId || attempt.jurisdictionId !== issuerScope.jurisdictionId ||
      attempt.completedAt === null || Date.parse(attempt.completedAt) < Date.parse(attempt.startedAt) ||
      attempt.status === "started" || attempt.completeSnapshot) {
    throw new Error("non-complete attempt cannot commit a generation or retraction");
  }
  return attempt;
}
