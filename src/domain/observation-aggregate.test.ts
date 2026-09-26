import { describe, expect, it } from "vitest";
import {
  AGGREGATE_CAVEATS, AggregationConfigSchema, ObservationAggregateSchema, aggregateObservations, fnv1a64,
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
    kind: "community-observation", id: `synthetic-${counter}`, topic: "smoke", redactedText: "SYNTHETIC REPORT TEXT ONLY",
    observedAt: "2026-01-01T01:20:00Z", publishedAt: "2026-01-01T01:30:00Z",
    approximatePoint: [0.123456, 0.654321], precisionMeters: 500, verification: "unverified", ...overrides,
  };
}
const run = (observations: unknown[], moderation: unknown = attested, extra: Partial<typeof config> = {}) =>
  aggregateObservations({ now, config: { ...config, ...extra }, moderation, observations });

describe("observation aggregate", () => {
  it("withholds without a moderation attestation, even with many observations", () => {
    const result = run([observation(), observation(), observation()], { status: "missing", detail: "no moderation owner" });
    expect(result.state).toBe("withheld");
    if (result.state !== "withheld") return;
    expect(result.reason).toBe("missing-moderation");
    expect(result.cells).toEqual([]);
    expect(result.allClear).toBe(false);
    expect(result.provenance.inputObservationIds).toHaveLength(3);
  });

  it("publishes a coarse cell per hazard kind and time bin, and never a point or polygon", () => {
    const inputs = [
      observation(), observation({ approximatePoint: [0.129999, 0.650001] }),
      observation({ topic: "road-obstruction" }), observation({ topic: "road-obstruction" }), observation({ topic: "road-obstruction" }),
      observation({ topic: "flooding", observedAt: "2026-01-01T00:10:00Z" }), observation({ topic: "flooding", observedAt: "2026-01-01T00:50:00Z" }),
      observation({ topic: "wind-damage" }), // alone in its cell/kind/bin -> withheld
    ];
    const result = run(inputs);
    expect(ObservationAggregateSchema.safeParse(result).success).toBe(true);
    expect(result.state).toBe("published");
    if (result.state !== "published") return;
    expect(result.cells.map((cell) => [cell.hazardKind, cell.reportCount, cell.countBin])).toEqual([
      ["flooding", 2, "2-3"], ["road-obstruction", 3, "2-3"], ["smoke", 2, "2-3"],
    ]);
    expect(result.withheldCellCount).toBe(1);
    const cell = result.cells[0]!;
    expect(cell.cellId).toBe("cell:0.02:6:32");
    expect(cell.cellBounds).toEqual([[0.12, 0.64], [0.14, 0.66]]);
    expect(cell.timeBinStart).toBe("2026-01-01T00:00:00.000Z");
    expect(cell.timeBinEnd).toBe("2026-01-01T01:00:00.000Z");
    expect(cell.verification).toBe("unverified");
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("0.123456");
    expect(serialized).not.toContain("0.654321");
    expect(serialized).not.toContain("SYNTHETIC REPORT TEXT ONLY");
    expect(serialized).not.toContain("approximatePoint");
    expect(serialized).not.toContain("Polygon");
    expect(result.usage).toEqual({ routingHazardInput: false, officialAuthority: false, boundaryOrModelEstimate: false });
    expect(result.caveats).toEqual(AGGREGATE_CAVEATS);
    expect(result.provenance.uniqueReporterDedupe).toBe("not-possible");
    expect(result.provenance.sourceTimes.earliestObservedAt).toBe("2026-01-01T00:10:00.000Z");
    expect(result.provenance.sourceTimes.latestPublishedAt).toBe("2026-01-01T01:30:00.000Z");
  });

  it("saturates counts so volume cannot escalate, and treats one id repeated as one observation", () => {
    const many = Array.from({ length: 14 }, () => observation());
    const result = run([...many, { ...many[0] }]);
    expect(result.state).toBe("published");
    if (result.state !== "published") return;
    expect(result.cells[0]).toMatchObject({ reportCount: 10, countSaturated: true, countBin: "10+" });
    expect(result.provenance.excluded).toEqual([{ id: many[0]!.id, reason: "duplicate-id" }]);
    expect(result.provenance.countedObservationCount).toBe(14);
  });

  it("excludes each ineligible observation with a named reason instead of moving it", () => {
    const result = run([
      observation({ approximatePoint: null, precisionMeters: null }),
      observation({ precisionMeters: 5000 }),
      observation({ approximatePoint: [5, 5] }),
      observation({ observedAt: "2025-12-31T10:00:00Z" }),
      observation({ observedAt: "2026-01-01T03:00:00Z" }),
      observation({ publishedAt: "2026-01-01T01:59:30Z" }),
    ]);
    expect(result.state).toBe("withheld");
    if (result.state !== "withheld") return;
    expect(result.reason).toBe("no-eligible-observations");
    expect(result.provenance.excluded.map((item) => item.reason)).toEqual([
      "no-public-point", "precision-coarser-than-cell", "outside-coverage", "expired", "future-dated", "published-after-attestation",
    ]);
  });

  it("withholds when every cell is under the threshold and reports only how many", () => {
    const result = run([observation(), observation({ topic: "fire" })], attested, { minReportsPerCell: 3 });
    expect(result).toMatchObject({ state: "withheld", reason: "all-cells-below-threshold", withheldCellCount: 2 });
  });

  it("rejects private marks, raw submissions, official notices and a fake all-clear", () => {
    const mark = { id: "mark-1", lat: 0.1, lng: 0.1, placedAt: now };
    expect(() => run([mark])).toThrow();
    expect(() => run([observation({ verification: "official" })])).toThrow();
    expect(() => run([observation({ kind: "official-notice" })])).toThrow();
    expect(() => run([observation({ redactedText: undefined })])).toThrow();
    const published = run([observation(), observation()]);
    expect(ObservationAggregateSchema.safeParse({ ...published, allClear: true }).success).toBe(false);
    expect(ObservationAggregateSchema.safeParse({ ...published, usage: { ...published.usage, routingHazardInput: true } }).success).toBe(false);
    expect(ObservationAggregateSchema.safeParse({ ...published, state: "published", cells: [] }).success).toBe(false);
    expect(ObservationAggregateSchema.safeParse({ ...published, caveats: { ...published.caveats, notAllClear: "all clear" } }).success).toBe(false);
  });

  it("bounds the configuration so cells stay coarse and windows stay short", () => {
    expect(AggregationConfigSchema.safeParse(config).success).toBe(true);
    expect(AggregationConfigSchema.safeParse({ ...config, cellSizeDegrees: 0.001 }).success).toBe(false);
    expect(AggregationConfigSchema.safeParse({ ...config, minReportsPerCell: 1 }).success).toBe(false);
    expect(AggregationConfigSchema.safeParse({ ...config, minReportsPerCell: 11 }).success).toBe(false);
    expect(AggregationConfigSchema.safeParse({ ...config, coverage: { description: "x", bounds: [[1, 1], [-1, -1]] } }).success).toBe(false);
    expect(AggregationConfigSchema.safeParse({ ...config, configVersion: "" }).success).toBe(false);
  });

  it("is deterministic and records a digest of the offered ids", () => {
    const inputs = [observation(), observation()];
    const first = run(inputs);
    const second = run([...inputs].reverse());
    expect(second).toEqual(first);
    expect(first.provenance.inputDigest.value).toBe(fnv1a64([...inputs.map((item) => item.id)].sort().join("\n")));
    expect(fnv1a64("")).toBe("cbf29ce484222325");
    expect(fnv1a64("a")).toBe("af63dc4c8601ec8c");
  });
});
