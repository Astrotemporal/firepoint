import { describe, expect, it } from "vitest";
import {
  CompleteSnapshotRetractionSchema,
  SourceFetchAttemptSchema,
  SourceRecordSchema,
  SourceRegistrySchema,
  SourceScopeSchema,
  SourceIssuerScopeSchema,
  assertSourceIssuerScope,
  assertFetchAttemptTransition,
  assertCompleteSnapshotReference,
  assertSameSourceScope,
} from "./source-cache";

// Synthetic fixtures only. These tests never call FEMA, LA County, Genasys, or Glendale GIS.
const now = "2026-09-27T12:00:00Z";
const sourceRegistryId = "11111111-1111-4111-8111-111111111111";
const generationId = "22222222-2222-4222-8222-222222222222";
const scope = SourceScopeSchema.parse({ tenantId: "firepoint-preview", jurisdictionId: "us.ca.glendale" });

describe("source-cache contract", () => {
  it("requires strict tenant and jurisdiction scopes", () => {
    expect(SourceScopeSchema.safeParse({ tenantId: "all", jurisdictionId: "us.ca.glendale" }).success).toBe(false);
    expect(SourceScopeSchema.safeParse({ tenantId: "firepoint-preview", jurisdictionId: "gln" }).success).toBe(false);
    expect(SourceScopeSchema.safeParse(scope).success).toBe(true);
  });

  it("stores source registry metadata without enabling production polling or all-clear empties", () => {
    const registry = SourceRegistrySchema.parse({
      ...scope,
      id: sourceRegistryId,
      sourceKey: "fema-open-shelters",
      registryClass: "official-live-candidate",
      displayName: "FEMA OpenShelters candidate",
      issuer: "FEMA",
      sourceUrl: "https://gis.fema.gov/arcgis/rest/services/NSS/OpenShelters/FeatureServer/0",
      recordKinds: ["shelter-status"],
      coverageStatus: "incomplete",
      rightsStatus: "unresolved",
      emptyOk: true,
      emptyResultMeaning: "not-all-clear",
      productionAutoPollingEnabled: false,
      notes: "Manual 2026-09-27 check found 0 LA rows; that is not an all-clear.",
      createdAt: now,
      updatedAt: now,
    });

    expect(registry.emptyResultMeaning).toBe("not-all-clear");
    expect(SourceRegistrySchema.safeParse({ ...registry, productionAutoPollingEnabled: true }).success).toBe(false);
    expect(SourceRegistrySchema.safeParse({ ...registry, emptyResultMeaning: "all-clear" }).success).toBe(false);
  });

  it("distinguishes empty success, failure, and last-good provenance", () => {
    expect(SourceFetchAttemptSchema.safeParse({
      ...scope,
      id: "33333333-3333-4333-8333-333333333333",
      sourceRegistryId,
      status: "succeeded-empty",
      startedAt: now,
      completedAt: now,
      upstreamRequestUrl: "https://example.org/synthetic-source",
      httpStatus: 200,
      rowsSeen: 0,
      rowsAccepted: 0,
      completeSnapshot: false,
      emptyOk: true,
      lastGoodGenerationId: generationId,
      failure: null,
    }).success).toBe(true);

    expect(SourceFetchAttemptSchema.safeParse({
      ...scope,
      id: "33333333-3333-4333-8333-333333333333",
      sourceRegistryId,
      status: "failed",
      startedAt: now,
      completedAt: now,
      upstreamRequestUrl: "https://example.org/synthetic-source",
      httpStatus: 503,
      rowsSeen: 0,
      rowsAccepted: 0,
      completeSnapshot: false,
      emptyOk: false,
      lastGoodGenerationId: generationId,
      failure: null,
    }).success).toBe(false);
  });

  it("allows retraction requests only from complete snapshots", () => {
    expect(CompleteSnapshotRetractionSchema.safeParse({
      ...scope,
      sourceRegistryId,
      retractingGenerationId: generationId,
      retractingGenerationCompleteSnapshot: true,
      missingUpstreamRecordIds: ["SYNTHETIC-1"],
      reason: "missing-from-complete-snapshot",
    }).success).toBe(true);

    expect(CompleteSnapshotRetractionSchema.safeParse({
      ...scope,
      sourceRegistryId,
      retractingGenerationId: generationId,
      retractingGenerationCompleteSnapshot: false,
      missingUpstreamRecordIds: ["SYNTHETIC-1"],
      reason: "missing-from-complete-snapshot",
    }).success).toBe(false);
  });

  it("keeps authoritative source records separate from community reports and polygons", () => {
    const record = SourceRecordSchema.parse({
      ...scope,
      id: "44444444-4444-4444-8444-444444444444",
      sourceRegistryId,
      generationId,
      upstreamRecordId: "SYNTHETIC-SHELTER-1",
      kind: "shelter-status",
      status: "current",
      name: "Synthetic fixture shelter",
      description: null,
      locationText: "Synthetic test address",
      point: { longitude: -118.25, latitude: 34.14 },
      provenance: {
        issuer: "Synthetic test issuer",
        sourceUrl: "https://example.org/synthetic-source",
        sourceVintage: "synthetic fixture",
        sourceIssuedAt: null,
        fetchedAt: now,
        expiresAt: null,
        completeSnapshot: true,
        lastGoodGenerationId: generationId,
        fetchFailure: null,
      },
      retractedByGenerationId: null,
      createdAt: now,
    });

    expect(record.locationText).toBe("Synthetic test address");
    expect("geometry" in record).toBe(false);
  });

  it("fails fast on tenant or jurisdiction mixups", () => {
    expect(() => assertSameSourceScope(scope, { tenantId: "firepoint-preview", jurisdictionId: "us.ca.lacounty" }))
      .toThrow("source-cache scope mismatch");
  });
});


describe("issuer and complete-generation boundary", () => {
  const authority = SourceIssuerScopeSchema.parse({ ...scope, issuer: "Synthetic Agency" });
  const attempt = SourceFetchAttemptSchema.parse({
    ...scope, id: "33333333-3333-4333-8333-333333333333", sourceRegistryId,
    status: "started", startedAt: now, completedAt: null, upstreamRequestUrl: null,
    httpStatus: null, rowsSeen: 0, rowsAccepted: 0, completeSnapshot: false,
    emptyOk: false, lastGoodGenerationId: generationId, failure: null,
  });
  const generation = {
    ...scope, id: generationId, sourceRegistryId,
    fetchAttemptId: attempt.id, generationNumber: 1, issuer: authority.issuer,
    sourceUrl: "https://example.org/synthetic-source", sourceVintage: "synthetic",
    sourceIssuedAt: null, fetchedAt: now, expiresAt: null, recordCount: 1,
    completeSnapshot: true, emptyResultMeaning: "not-all-clear" as const,
    previousCompleteGenerationId: null, createdAt: now,
  };

  it("rejects issuer and jurisdiction mismatches (including unknown issuers)", () => {
    expect(() => assertSourceIssuerScope(authority, { ...scope, issuer: "Other Agency" })).toThrow("issuer/scope mismatch");
    expect(() => assertSourceIssuerScope(authority, { ...authority, jurisdictionId: "us.ca.lacounty" })).toThrow("issuer/scope mismatch");
    expect(SourceIssuerScopeSchema.safeParse({ ...scope, issuer: "  " }).success).toBe(false);
    expect(() => assertSourceIssuerScope(authority, { ...scope, issuer: authority.issuer })).not.toThrow();
  });

  it("does not allow failure or gated attempts to replace last-good or claim completeness", () => {
    const failure = { ...attempt, status: "failed" as const, completedAt: now, completeSnapshot: false,
      failure: { kind: "network" as const, message: "synthetic failure", retryable: true } };
    expect(() => assertFetchAttemptTransition(attempt, failure)).not.toThrow();
    expect(() => assertFetchAttemptTransition(attempt, { ...failure, lastGoodGenerationId: null }))
      .toThrow("invalid source fetch attempt transition");
    expect(() => assertFetchAttemptTransition(attempt, { ...failure, completeSnapshot: true }))
      .toThrow("invalid source fetch attempt result");
    expect(() => assertFetchAttemptTransition(attempt, { ...failure, sourceRegistryId: "44444444-4444-4444-8444-444444444444" }))
      .toThrow("invalid source fetch attempt transition");
    expect(() => assertFetchAttemptTransition(failure, failure))
      .toThrow("invalid source fetch attempt transition");
    expect(() => assertFetchAttemptTransition(attempt, { ...attempt, status: "succeeded-empty", completedAt: now, rowsSeen: 1, rowsAccepted: 1, emptyOk: true }))
      .toThrow("invalid source fetch attempt result");
  });

  it("rejects incomplete, foreign-source, wrong-issuer, and non-earlier previous generations", () => {
    const next = { ...generation, id: "55555555-5555-4555-8555-555555555555", generationNumber: 2 };
    expect(() => assertCompleteSnapshotReference(authority, next, generation)).not.toThrow();
    expect(() => assertCompleteSnapshotReference(authority, next, { ...generation, completeSnapshot: false }))
      .toThrow("invalid previous complete generation");
    expect(() => assertCompleteSnapshotReference(authority, next, { ...generation, sourceRegistryId: "66666666-6666-4666-8666-666666666666" }))
      .toThrow("invalid previous complete generation");
    expect(() => assertCompleteSnapshotReference(authority, next, { ...generation, issuer: "Other Agency" }))
      .toThrow("issuer/scope mismatch");
    expect(() => assertCompleteSnapshotReference(authority, generation, next))
      .toThrow("invalid previous complete generation");
  });
});
