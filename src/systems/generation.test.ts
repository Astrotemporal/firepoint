import { describe, expect, it } from "vitest";
import { IngestAttemptSchema, SourceDescriptorSchema, planGenerationPromotion } from "./generation";

// All values are synthetic evidence for unit tests only, never a resident feed.
const sourceKey = "synthetic-test-source";
const t0 = "2026-01-01T00:00:00.000Z";
const t1 = "2026-01-01T01:00:00.000Z";
const t2 = "2026-01-01T02:00:00.000Z";
const empty = { sourceKey, lastAttemptAt: null, lastGood: null };
const candidate = { sourceKey, generationId: "SYNTHETIC-1", fetchedAt: t1, sourceAsOf: null,
  recordCount: 0, contentSha256: "a".repeat(64), parserVersion: "synthetic-test-v1",
  complete: true, coverageVerified: true, rightsReviewed: true };
const complete = { sourceKey, attemptedAt: t1, outcome: "complete", candidate, failureReason: null };

describe("source generation promotion plan (not a worker or public feed)", () => {
  it("requires named provenance; unknown publisher cadence stays unknown", () => {
    const source = SourceDescriptorSchema.parse({ sourceKey, operator: "Synthetic test operator", issuer: null,
      sourceUrl: "https://example.org/synthetic-only", lane: "standing-hazard",
      coverageDescription: null, updateCadenceSeconds: null });
    expect(source.issuer).toBeNull();
    expect(source.updateCadenceSeconds).toBeNull();
    expect(() => SourceDescriptorSchema.parse({ ...source, sourceUrl: "http://example.org/test" })).toThrow();
  });

  it("can publish a complete, reviewed zero-record generation without claiming all-clear", () => {
    const result = planGenerationPromotion(empty, complete);
    expect(result.action).toBe("publish");
    expect(result.next.lastGood?.recordCount).toBe(0);
    expect(result.next.lastGood?.sourceAsOf).toBeNull();
    expect(result).not.toHaveProperty("allClear");
    expect(result.next).not.toHaveProperty("allClear");
  });

  it.each([
    ["complete", false, true, true, "incomplete"],
    ["coverageVerified", true, false, true, "coverage-unverified"],
    ["rightsReviewed", true, true, false, "rights-unreviewed"],
  ])("retains last-good when %s gate fails", (_case, isComplete, coverage, rights, reason) => {
    const lastGood = planGenerationPromotion(empty, complete).next.lastGood;
    const result = planGenerationPromotion({ sourceKey, lastAttemptAt: t1, lastGood },
      { ...complete, attemptedAt: t2, candidate: { ...candidate, generationId: "SYNTHETIC-2",
        fetchedAt: t2, complete: isComplete, coverageVerified: coverage, rightsReviewed: rights } });
    expect(result).toMatchObject({ action: "retain-last-good", reason, next: { lastGood } });
    expect(result.next.lastAttemptAt).toBe(t2);
  });

  it("retains the last complete generation on outage or partial publisher response", () => {
    const previous = planGenerationPromotion(empty, complete).next;
    for (const outcome of ["partial", "failed"] as const) {
      const result = planGenerationPromotion(previous, { sourceKey, attemptedAt: t2, outcome,
        candidate: null, failureReason: "SYNTHETIC upstream error" });
      expect(result).toMatchObject({ action: "retain-last-good", reason: "failed-or-partial" });
      expect(result.next.lastGood).toEqual(previous.lastGood);
    }
  });

  it("never lets a late older attempt or generation overwrite last-good", () => {
    const previous = planGenerationPromotion(empty, complete).next;
    expect(planGenerationPromotion(previous, { ...complete, attemptedAt: t0 }).reason).toBe("older-attempt");
    expect(planGenerationPromotion(previous, { ...complete, attemptedAt: t2,
      candidate: { ...candidate, generationId: "SYNTHETIC-OLDER", fetchedAt: t0 } }).reason).toBe("older-generation");
    expect(planGenerationPromotion(previous, { ...complete, attemptedAt: t2,
      candidate: { ...candidate, generationId: "SYNTHETIC-SAME-TIME" } }).reason).toBe("older-generation");
  });

  it("rejects mismatched source and malformed completion evidence", () => {
    expect(() => planGenerationPromotion(empty, { ...complete, sourceKey: "other-source" })).toThrow();
    expect(() => IngestAttemptSchema.parse({ ...complete, candidate: { ...candidate, contentSha256: "SYNTHETIC-NOT-A-HASH" } })).toThrow();
    expect(() => IngestAttemptSchema.parse({ ...complete, candidate: null })).toThrow();
  });
});
