import { z } from "zod";

/**
 * Draft storage contracts for authoritative source-cache rows.
 *
 * This file is intentionally pure. It does not fetch upstream sources, start a
 * poller, expose UI state, or mix agency/source records with resident reports.
 */
const Instant = z.iso.datetime({ offset: true });
const Uuid = z.uuid();
const HttpsUrl = z.url().refine((value) => value.startsWith("https://"), "source URLs must be HTTPS");
const ScopedId = z
  .string()
  .min(3)
  .max(96)
  .regex(/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])$/, "use a concrete lowercase scope id")
  .refine((value) => !["*", "all", "global", "public", "default", "none"].includes(value),
    "wildcard scope ids are not allowed");

export const SourceScopeSchema = z.object({
  tenantId: ScopedId,
  jurisdictionId: ScopedId.refine((value) => value.includes("."),
    "jurisdiction must be explicit, for example us.ca.glendale"),
});
export type SourceScope = z.infer<typeof SourceScopeSchema>;

/** Explicit issuer authority is required at every storage operation boundary. */
export const SourceIssuerScopeSchema = SourceScopeSchema.extend({
  issuer: z.string().min(1).refine(
    (value) => value.trim() === value && value.trim().length > 0,
    "issuer must be a concrete exact label",
  ),
});
export type SourceIssuerScope = z.infer<typeof SourceIssuerScopeSchema>;

export function assertSourceIssuerScope(expected: SourceIssuerScope, actual: SourceScope & { issuer: string }): void {
  const scoped = SourceIssuerScopeSchema.parse(expected);
  const candidate = SourceIssuerScopeSchema.parse(actual);
  if (scoped.tenantId !== candidate.tenantId || scoped.jurisdictionId !== candidate.jurisdictionId || scoped.issuer !== candidate.issuer) {
    throw new Error("source-cache issuer/scope mismatch");
  }
}

export const SourceRecordKindSchema = z.enum([
  "shelter-status",
  "evacuation-order",
  "evacuation-warning",
  "evacuation-advisory",
  "standing-reference",
]);
export type SourceRecordKind = z.infer<typeof SourceRecordKindSchema>;

export const SourceRegistrySchema = SourceScopeSchema.extend({
  id: Uuid,
  sourceKey: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  registryClass: z.enum(["official-live-candidate", "standing-reference-snapshot"]),
  displayName: z.string().min(1),
  issuer: z.string().min(1),
  sourceUrl: HttpsUrl,
  recordKinds: z.array(SourceRecordKindSchema).min(1),
  coverageStatus: z.enum(["unverified", "incomplete", "validated-partial", "validated-complete-for-scope"]),
  rightsStatus: z.enum(["unresolved", "preview-only", "storage-approved", "redistribution-approved"]),
  /** Empty source responses are source-health facts only. They are never safety advice. */
  emptyOk: z.boolean(),
  emptyResultMeaning: z.literal("not-all-clear"),
  /** A later reviewed migration must change this before any production scheduler exists. */
  productionAutoPollingEnabled: z.literal(false),
  notes: z.string().min(1),
  createdAt: Instant,
  updatedAt: Instant,
});
export type SourceRegistry = z.infer<typeof SourceRegistrySchema>;

export const FetchFailureSchema = z.object({
  kind: z.enum(["network", "http", "schema", "rights", "quota", "coverage", "unknown"]),
  message: z.string().min(1),
  retryable: z.boolean(),
});
export type FetchFailure = z.infer<typeof FetchFailureSchema>;

export const SourceFetchAttemptSchema = SourceScopeSchema.extend({
  id: Uuid,
  sourceRegistryId: Uuid,
  status: z.enum(["started", "succeeded-non-empty", "succeeded-empty", "failed", "skipped-gated"]),
  startedAt: Instant,
  completedAt: Instant.nullable(),
  upstreamRequestUrl: HttpsUrl.nullable(),
  httpStatus: z.number().int().min(100).max(599).nullable(),
  rowsSeen: z.number().int().nonnegative(),
  rowsAccepted: z.number().int().nonnegative(),
  completeSnapshot: z.boolean(),
  emptyOk: z.boolean(),
  lastGoodGenerationId: Uuid.nullable(),
  failure: FetchFailureSchema.nullable(),
}).superRefine((attempt, ctx) => {
  if (attempt.rowsAccepted > attempt.rowsSeen) {
    ctx.addIssue({ code: "custom", path: ["rowsAccepted"], message: "rowsAccepted cannot exceed rowsSeen" });
  }
  if (attempt.status === "failed" && attempt.failure === null) {
    ctx.addIssue({ code: "custom", path: ["failure"], message: "failed fetches require failure details" });
  }
  if (attempt.status !== "failed" && attempt.failure !== null) {
    ctx.addIssue({ code: "custom", path: ["failure"], message: "non-failed fetches must not include failure" });
  }
  if (attempt.status === "succeeded-empty" && !attempt.emptyOk) {
    ctx.addIssue({ code: "custom", path: ["emptyOk"], message: "empty success requires explicit emptyOk" });
  }
});
export type SourceFetchAttempt = z.infer<typeof SourceFetchAttemptSchema>;

export const SourceGenerationSchema = SourceScopeSchema.extend({
  id: Uuid,
  sourceRegistryId: Uuid,
  fetchAttemptId: Uuid,
  generationNumber: z.number().int().positive(),
  issuer: z.string().min(1),
  sourceUrl: HttpsUrl,
  sourceVintage: z.string().min(1),
  sourceIssuedAt: Instant.nullable(),
  fetchedAt: Instant,
  expiresAt: Instant.nullable(),
  recordCount: z.number().int().nonnegative(),
  completeSnapshot: z.boolean(),
  emptyResultMeaning: z.literal("not-all-clear"),
  previousCompleteGenerationId: Uuid.nullable(),
  createdAt: Instant,
}).superRefine((generation, ctx) => {
  if (generation.expiresAt !== null && Date.parse(generation.expiresAt) <= Date.parse(generation.fetchedAt)) {
    ctx.addIssue({ code: "custom", path: ["expiresAt"], message: "expiresAt must be after fetchedAt" });
  }
});
export type SourceGeneration = z.infer<typeof SourceGenerationSchema>;

export const SourceRecordProvenanceSchema = z.object({
  issuer: z.string().min(1),
  sourceUrl: HttpsUrl,
  sourceVintage: z.string().min(1),
  sourceIssuedAt: Instant.nullable(),
  fetchedAt: Instant,
  expiresAt: Instant.nullable(),
  completeSnapshot: z.boolean(),
  lastGoodGenerationId: Uuid.nullable(),
  fetchFailure: FetchFailureSchema.nullable(),
});
export type SourceRecordProvenance = z.infer<typeof SourceRecordProvenanceSchema>;

export const SourceRecordSchema = SourceScopeSchema.extend({
  id: Uuid,
  sourceRegistryId: Uuid,
  generationId: Uuid,
  upstreamRecordId: z.string().min(1).max(256),
  kind: SourceRecordKindSchema,
  status: z.enum(["current", "superseded", "retracted"]),
  name: z.string().min(1),
  description: z.string().nullable(),
  /** Text/point only. Do not persist third-party evacuation polygons before rights approval. */
  locationText: z.string().nullable(),
  point: z.object({ longitude: z.number().min(-180).max(180), latitude: z.number().min(-90).max(90) }).nullable(),
  provenance: SourceRecordProvenanceSchema,
  retractedByGenerationId: Uuid.nullable(),
  createdAt: Instant,
}).superRefine((record, ctx) => {
  if (record.status === "retracted" && record.retractedByGenerationId === null) {
    ctx.addIssue({ code: "custom", path: ["retractedByGenerationId"], message: "retracted records require a generation" });
  }
  if (record.status !== "retracted" && record.retractedByGenerationId !== null) {
    ctx.addIssue({ code: "custom", path: ["retractedByGenerationId"], message: "only retracted records can set this field" });
  }
});
export type SourceRecord = z.infer<typeof SourceRecordSchema>;

export const CompleteSnapshotRetractionSchema = SourceScopeSchema.extend({
  sourceRegistryId: Uuid,
  retractingGenerationId: Uuid,
  retractingGenerationCompleteSnapshot: z.literal(true),
  missingUpstreamRecordIds: z.array(z.string().min(1)).min(1),
  reason: z.literal("missing-from-complete-snapshot"),
});
export type CompleteSnapshotRetraction = z.infer<typeof CompleteSnapshotRetractionSchema>;

/** Successful fetches can be partial, but only complete successful generations are last-good references. */
export function assertFetchAttemptTransition(previous: SourceFetchAttempt, next: SourceFetchAttempt): void {
  const before = SourceFetchAttemptSchema.parse(previous);
  const after = SourceFetchAttemptSchema.parse(next);
  assertSameSourceScope(before, after);
  if (before.id !== after.id || before.sourceRegistryId !== after.sourceRegistryId ||
      before.startedAt !== after.startedAt || before.status !== "started" || after.status === "started" ||
      after.completedAt === null || Date.parse(after.completedAt) < Date.parse(after.startedAt) ||
      before.lastGoodGenerationId !== after.lastGoodGenerationId) {
    throw new Error("invalid source fetch attempt transition");
  }
  if (after.status === "succeeded-empty" && after.rowsAccepted !== 0 ||
      after.status === "succeeded-non-empty" && after.rowsAccepted === 0 ||
      (after.status === "failed" || after.status === "skipped-gated") && after.completeSnapshot) {
    throw new Error("invalid source fetch attempt result");
  }
}

export function assertCompleteSnapshotReference(
  scope: SourceIssuerScope,
  generation: SourceGeneration,
  referenced: SourceGeneration,
): void {
  const authority = SourceIssuerScopeSchema.parse(scope);
  const current = SourceGenerationSchema.parse(generation);
  const candidate = SourceGenerationSchema.parse(referenced);
  assertSourceIssuerScope(authority, current);
  assertSourceIssuerScope(authority, candidate);
  if (current.sourceRegistryId !== candidate.sourceRegistryId ||
      !candidate.completeSnapshot || candidate.generationNumber >= current.generationNumber) {
    throw new Error("invalid previous complete generation");
  }
}

export function assertSameSourceScope(expected: SourceScope, actual: SourceScope): void {
  if (expected.tenantId !== actual.tenantId || expected.jurisdictionId !== actual.jurisdictionId) {
    throw new Error("source-cache scope mismatch");
  }
}
