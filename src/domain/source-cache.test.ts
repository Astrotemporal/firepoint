import { describe, expect, it } from "vitest";
import {
  CompleteSnapshotRetractionSchema,
  SourceFetchAttemptSchema,
  SourceRecordSchema,
  SourceRegistrySchema,
  SourceScopeSchema,
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
