import { describe, expect, it } from "vitest";
import {
  AGGREGATE_CAVEATS, AggregationAuditSchema, AggregationConfigSchema, ObservationAggregateSchema, aggregateObservations,
} from "./observation-aggregate";

// Synthetic fixtures only. Nothing here describes a real report, place, event, or person.
const now = "2026-01-01T02:00:00Z";
const config = {
  configVersion: "synthetic-test-config", algorithm: "coarse-cell-count-bin", cellSizeDegrees: 0.02,
  timeBinSeconds: 3600, maxAgeSeconds: 6 * 3600, minReportsPerCell: 2, countCap: 10,
  coverage: { description: "SYNTHETIC TEST ONLY", bounds: [[-1, -1], [1, 1]] },
};
const attested = { status: "attested", queueId: "synthetic-queue", policyVersion: "synthetic-policy-0",
  ownerRole: "synthetic-moderation-owner", attestedAt: "2026-01-01T01:59:00Z" };

let counter = 0;
function observation(overrides: Record<string, unknown> = {}) {
  counter += 1;
  return {
    kind: "community-observation", id: `synthetic-id-${counter}`, topic: "smoke", redactedText: "SYNTHETIC REPORT TEXT ONLY",
    observedAt: "2026-01-01T01:20:00Z", publishedAt: "2026-01-01T01:30:00Z",
    approximatePoint: [0.123456, 0.654321], precisionMeters: 500, verification: "unverified", ...overrides,
  };
}
const run = (observations: unknown[], moderation: unknown = attested, extra: Partial<typeof config> = {}) =>
  aggregateObservations({ now, config: { ...config, ...extra }, moderation, observations });

/** Every id offered must be absent from the public half, whatever its state. */
function expectNoIds(aggregate: unknown, offered: { id: string }[]) {
  const serialized = JSON.stringify(aggregate);
  for (const item of offered) expect(serialized).not.toContain(item.id);
  expect(serialized).not.toContain("synthetic-id-");
  expect(serialized).not.toContain("inputObservationIds");
  expect(serialized).not.toContain("private-audit");
}

describe("observation aggregate", () => {
  it("withholds without a moderation attestation and still exposes no report ids", () => {
    const offered = [observation(), observation(), observation()];
    const { aggregate, audit } = run(offered, { status: "missing", detail: "no moderation owner" });
    expect(aggregate.state).toBe("withheld");
    if (aggregate.state !== "withheld") return;
    expect(aggregate.reason).toBe("missing-moderation");
    expect(aggregate.cells).toEqual([]);
    expect(aggregate.allClear).toBe(false);
    expect(aggregate.provenance.offeredObservationCount).toBe(3);
    expectNoIds(aggregate, offered);
    expect(audit.inputObservationIds).toEqual(offered.map((item) => item.id).sort());
  });

  it("publishes a coarse cell per hazard kind and time bin, and never a point, polygon, text or id", () => {
    const offered = [
      observation(), observation({ approximatePoint: [0.129999, 0.650001] }),
      observation({ topic: "road-obstruction" }), observation({ topic: "road-obstruction" }), observation({ topic: "road-obstruction" }),
      observation({ topic: "flooding", observedAt: "2026-01-01T00:10:00Z" }), observation({ topic: "flooding", observedAt: "2026-01-01T00:50:00Z" }),
      observation({ topic: "wind-damage" }), // alone in its cell/kind/bin -> withheld
    ];
    const { aggregate } = run(offered);
    expect(ObservationAggregateSchema.safeParse(aggregate).success).toBe(true);
    expect(aggregate.state).toBe("published");
    if (aggregate.state !== "published") return;
    expect(aggregate.cells.map((cell) => [cell.hazardKind, cell.reportCount, cell.countBin])).toEqual([
      ["flooding", 2, "2-3"], ["road-obstruction", 3, "2-3"], ["smoke", 2, "2-3"],
    ]);
    expect(aggregate.withheldCellCount).toBe(1);
    const cell = aggregate.cells[0]!;
    expect(cell.cellId).toBe("cell:0.02:6:32");
    expect(cell.cellBounds).toEqual([[0.12, 0.64], [0.14, 0.66]]);
    expect(cell.timeBinStart).toBe("2026-01-01T00:00:00.000Z");
    expect(cell.timeBinEnd).toBe("2026-01-01T01:00:00.000Z");
    expect(cell.verification).toBe("unverified");
    const serialized = JSON.stringify(aggregate);
    expect(serialized).not.toContain("0.123456");
    expect(serialized).not.toContain("0.654321");
    expect(serialized).not.toContain("SYNTHETIC REPORT TEXT ONLY");
    expect(serialized).not.toContain("approximatePoint");
    expect(serialized).not.toContain("Polygon");
    expectNoIds(aggregate, offered);
    expect(aggregate.usage).toEqual({ routingHazardInput: false, officialAuthority: false, boundaryOrModelEstimate: false });
    expect(aggregate.caveats).toEqual(AGGREGATE_CAVEATS);
    expect(aggregate.provenance.uniqueReporterDedupe).toBe("not-possible");
    expect(aggregate.provenance.sourceTimes.earliestObservedAt).toBe("2026-01-01T00:10:00.000Z");
    expect(aggregate.provenance.sourceTimes.latestPublishedAt).toBe("2026-01-01T01:30:00.000Z");
  });

  it("saturates counts so volume cannot escalate, and treats one id repeated as one observation", () => {
    const many = Array.from({ length: 14 }, () => observation());
    const { aggregate, audit } = run([...many, { ...many[0] }]);
    expect(aggregate.state).toBe("published");
    if (aggregate.state !== "published") return;
    expect(aggregate.cells[0]).toMatchObject({ reportCount: 10, countSaturated: true, countBin: "10+" });
    expect(aggregate.provenance.exclusionCounts["duplicate-id"]).toBe(1);
    expect(aggregate.provenance.countedObservationCount).toBe(14);
    expect(aggregate.provenance.offeredObservationCount).toBe(15);
    expect(audit.excluded).toEqual([{ id: many[0]!.id, reason: "duplicate-id" }]);
  });

  it("excludes each ineligible observation with a named reason, publicly only as counts", () => {
    const offered = [
      observation({ approximatePoint: null, precisionMeters: null }),
      observation({ precisionMeters: 5000 }),
      observation({ approximatePoint: [5, 5] }),
      observation({ observedAt: "2025-12-31T10:00:00Z" }),
      observation({ observedAt: "2026-01-01T03:00:00Z" }),
      observation({ publishedAt: "2026-01-01T01:59:30Z" }),
    ];
    const { aggregate, audit } = run(offered);
    expect(aggregate.state).toBe("withheld");
    if (aggregate.state !== "withheld") return;
    expect(aggregate.reason).toBe("no-eligible-observations");
    expect(aggregate.provenance.exclusionCounts).toEqual({
      "no-public-point": 1, "precision-coarser-than-cell": 1, "outside-coverage": 1, expired: 1,
      "future-dated": 1, "published-after-attestation": 1, "duplicate-id": 0,
    });
    expectNoIds(aggregate, offered);
    expect(audit.excluded.map((item) => item.reason)).toEqual([
      "no-public-point", "precision-coarser-than-cell", "outside-coverage", "expired", "future-dated", "published-after-attestation",
    ]);
  });

  it("withholds when every cell is under the threshold and reports only how many", () => {
    const offered = [observation(), observation({ topic: "fire" })];
    const { aggregate, audit } = run(offered, attested, { minReportsPerCell: 3 });
    expect(aggregate).toMatchObject({ state: "withheld", reason: "all-cells-below-threshold", withheldCellCount: 2 });
    expectNoIds(aggregate, offered);
    expect(audit.withheldCellCount).toBe(2);
  });

  it("keeps the audit as a separate, explicitly private object", () => {
    const { aggregate, audit } = run([observation(), observation()]);
    expect(AggregationAuditSchema.safeParse(audit).success).toBe(true);
    expect(audit.audience).toBe("private-audit");
    expect(ObservationAggregateSchema.safeParse({ ...aggregate, audit }).success).toBe(false);
    expect(ObservationAggregateSchema.safeParse({ ...aggregate, provenance: { ...aggregate.provenance, inputObservationIds: [] } }).success).toBe(false);
  });

  it("rejects private marks, raw submissions, official notices and a fake all-clear", () => {
    const mark = { id: "mark-1", lat: 0.1, lng: 0.1, placedAt: now };
    expect(() => run([mark])).toThrow();
    expect(() => run([observation({ verification: "official" })])).toThrow();
    expect(() => run([observation({ kind: "official-notice" })])).toThrow();
    expect(() => run([observation({ redactedText: undefined })])).toThrow();
    const { aggregate } = run([observation(), observation()]);
    expect(ObservationAggregateSchema.safeParse({ ...aggregate, allClear: true }).success).toBe(false);
    expect(ObservationAggregateSchema.safeParse({ ...aggregate, usage: { ...aggregate.usage, routingHazardInput: true } }).success).toBe(false);
    expect(ObservationAggregateSchema.safeParse({ ...aggregate, state: "published", cells: [] }).success).toBe(false);
    expect(ObservationAggregateSchema.safeParse({ ...aggregate, caveats: { ...aggregate.caveats, notAllClear: "all clear" } }).success).toBe(false);
  });

  it("bounds the configuration so cells stay coarse and windows stay short", () => {
    expect(AggregationConfigSchema.safeParse(config).success).toBe(true);
    expect(AggregationConfigSchema.safeParse({ ...config, cellSizeDegrees: 0.001 }).success).toBe(false);
    expect(AggregationConfigSchema.safeParse({ ...config, minReportsPerCell: 1 }).success).toBe(false);
    expect(AggregationConfigSchema.safeParse({ ...config, minReportsPerCell: 11 }).success).toBe(false);
    expect(AggregationConfigSchema.safeParse({ ...config, coverage: { description: "x", bounds: [[1, 1], [-1, -1]] } }).success).toBe(false);
    expect(AggregationConfigSchema.safeParse({ ...config, configVersion: "" }).success).toBe(false);
  });

  it("is deterministic regardless of input order", () => {
    const inputs = [observation(), observation()];
    expect(run([...inputs].reverse())).toEqual(run(inputs));
  });
});
