import type {
  CompleteSnapshotRetraction,
  SourceFetchAttempt,
  SourceGeneration,
  SourceRecord,
  SourceRegistry,
  SourceIssuerScope,
} from "@/domain/source-cache";

/**
 * Server-side storage port for the draft authoritative source cache.
 *
 * Implementations must validate with the Zod contracts before writing. They must
 * not call upstream feeds in tests, browser code, or production auto-pollers.
 * Community observations are deliberately outside this interface.
 */
export interface SourceCacheStorage {
  getRegistry(scope: SourceIssuerScope, sourceRegistryId: string): Promise<SourceRegistry | null>;
  listRegistries(scope: SourceIssuerScope): Promise<readonly SourceRegistry[]>;
  createFetchAttempt(scope: SourceIssuerScope, attempt: SourceFetchAttempt): Promise<void>;
  updateFetchAttemptResult(scope: SourceIssuerScope, attempt: SourceFetchAttempt): Promise<void>;
  insertImmutableGeneration(scope: SourceIssuerScope, input: {
    generation: SourceGeneration;
    records: readonly SourceRecord[];
  }): Promise<void>;
  getLastGoodGeneration(scope: SourceIssuerScope, sourceRegistryId: string): Promise<SourceGeneration | null>;
  listCurrentRecords(scope: SourceIssuerScope, sourceRegistryId: string): Promise<readonly SourceRecord[]>;

  /** Incomplete, failed, or gated snapshots must never retract existing records. */
  markRetractedFromCompleteSnapshot(scope: SourceIssuerScope, retraction: CompleteSnapshotRetraction): Promise<void>;
}
