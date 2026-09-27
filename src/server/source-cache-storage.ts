import type {
  CompleteSnapshotRetraction,
  SourceFetchAttempt,
  SourceGeneration,
  SourceRecord,
  SourceRegistry,
  SourceScope,
} from "@/domain/source-cache";

/**
 * Server-side storage port for the draft authoritative source cache.
 *
 * Implementations must validate with the Zod contracts before writing. They must
 * not call upstream feeds in tests, browser code, or production auto-pollers.
 * Community observations are deliberately outside this interface.
 */
export interface SourceCacheStorage {
  getRegistry(scope: SourceScope, sourceRegistryId: string): Promise<SourceRegistry | null>;
  listRegistries(scope: SourceScope): Promise<readonly SourceRegistry[]>;
  createFetchAttempt(attempt: SourceFetchAttempt): Promise<void>;
  updateFetchAttemptResult(attempt: SourceFetchAttempt): Promise<void>;
  insertImmutableGeneration(input: {
    generation: SourceGeneration;
    records: readonly SourceRecord[];
  }): Promise<void>;
  getLastGoodGeneration(scope: SourceScope, sourceRegistryId: string): Promise<SourceGeneration | null>;
  listCurrentRecords(scope: SourceScope, sourceRegistryId: string): Promise<readonly SourceRecord[]>;

  /** Incomplete, failed, or gated snapshots must never retract existing records. */
  markRetractedFromCompleteSnapshot(retraction: CompleteSnapshotRetraction): Promise<void>;
}
