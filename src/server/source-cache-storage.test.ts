import { describe, expect, it } from "vitest";
import { assertCompleteSnapshotCommit, assertNonCompleteAttempt } from "./source-cache-storage";

// Pure synthetic contract tests. No database, publisher, or application route.
const scope = { tenantId: "synthetic-test", jurisdictionId: "us.ca.glendale", issuer: "Synthetic Agency" };
const sourceRegistryId = "11111111-1111-4111-8111-111111111111";
const attemptId = "22222222-2222-4222-8222-222222222222";
const generationId = "33333333-3333-4333-8333-333333333333";
const priorId = "44444444-4444-4444-8444-444444444444";
const at = "2026-09-27T01:00:00Z";
const url = "https://example.org/synthetic-only";
const attempt = {
  tenantId: scope.tenantId, jurisdictionId: scope.jurisdictionId,
  id: attemptId, sourceRegistryId, status: "succeeded-non-empty" as const,
  startedAt: at, completedAt: at, upstreamRequestUrl: url, httpStatus: 200,
  rowsSeen: 1, rowsAccepted: 1, completeSnapshot: true, emptyOk: false,
  lastGoodGenerationId: priorId, failure: null,
};
const generation = {
  tenantId: scope.tenantId, jurisdictionId: scope.jurisdictionId,
  id: generationId, sourceRegistryId, fetchAttemptId: attemptId, generationNumber: 2,
  issuer: scope.issuer, sourceUrl: url, sourceVintage: "synthetic", sourceIssuedAt: null,
  fetchedAt: at, expiresAt: "2026-09-27T02:00:00Z", recordCount: 1,
  completeSnapshot: true, emptyResultMeaning: "not-all-clear" as const,
  previousCompleteGenerationId: priorId, createdAt: at,
};
const record = {
  tenantId: scope.tenantId, jurisdictionId: scope.jurisdictionId,
  id: "55555555-5555-4555-8555-555555555555", sourceRegistryId,
  generationId, upstreamRecordId: "synthetic-1", kind: "shelter-status" as const,
  status: "current" as const, name: "Synthetic test only", description: null,
  locationText: null, point: null, retractedByGenerationId: null, createdAt: at,
  provenance: {
    issuer: scope.issuer, sourceUrl: url, sourceVintage: "synthetic", sourceIssuedAt: null,
    fetchedAt: at, expiresAt: generation.expiresAt, completeSnapshot: true,
    lastGoodGenerationId: priorId, fetchFailure: null,
  },
};

describe("atomic source-cache port proposal (no implementation)", () => {
  it("accepts only matched complete snapshot payloads; never infers all-clear", () => {
    const payload = assertCompleteSnapshotCommit(scope, { attempt, generation, records: [record] });
    expect(payload.generation.emptyResultMeaning).toBe("not-all-clear");
    expect(() => assertCompleteSnapshotCommit(scope, {
      attempt: { ...attempt, rowsAccepted: 0 }, generation, records: [record],
    })).toThrow();
    expect(() => assertCompleteSnapshotCommit(scope, {
      attempt, generation: { ...generation, previousCompleteGenerationId: null }, records: [record],
    })).toThrow();
    expect(() => assertCompleteSnapshotCommit(scope, {
      attempt, generation, records: [record, { ...record, id: "66666666-6666-4666-8666-666666666666" }],
    })).toThrow();
  });
  it("rejects foreign issuer, incomplete, and stale-shaped record provenance", () => {
    expect(() => assertCompleteSnapshotCommit({ ...scope, issuer: "Other Agency" }, { attempt, generation, records: [record] })).toThrow();
    expect(() => assertCompleteSnapshotCommit(scope, {
      attempt: { ...attempt, completeSnapshot: false }, generation, records: [record],
    })).toThrow();
    expect(() => assertCompleteSnapshotCommit(scope, {
      attempt, generation, records: [{ ...record, provenance: { ...record.provenance, lastGoodGenerationId: null } }],
    })).toThrow();
  });
  it("requires explicit empty opt-in and not-all-clear semantics", () => {
    const emptyAttempt = { ...attempt, status: "succeeded-empty" as const, rowsSeen: 0, rowsAccepted: 0, emptyOk: true };
    const emptyGeneration = { ...generation, recordCount: 0 };
    expect(assertCompleteSnapshotCommit(scope, { attempt: emptyAttempt, generation: emptyGeneration, records: [] }).records).toEqual([]);
    expect(() => assertCompleteSnapshotCommit(scope, {
      attempt: { ...emptyAttempt, emptyOk: false }, generation: emptyGeneration, records: [],
    })).toThrow();
    expect(() => assertCompleteSnapshotCommit(scope, {
      attempt: emptyAttempt, generation: { ...emptyGeneration, emptyResultMeaning: "all-clear" as "not-all-clear" }, records: [],
    })).toThrow();
  });
  it("allows failure without a generation; rejects completed success or completeness", () => {
    const failure = { ...attempt, status: "failed" as const, completeSnapshot: false,
      rowsSeen: 0, rowsAccepted: 0, failure: { kind: "network" as const, message: "synthetic failure", retryable: true } };
    expect(assertNonCompleteAttempt(scope, failure).lastGoodGenerationId).toBe(priorId);
    expect(() => assertNonCompleteAttempt(scope, attempt)).toThrow();
    expect(() => assertNonCompleteAttempt(scope, { ...failure, completeSnapshot: true })).toThrow();
  });
});
