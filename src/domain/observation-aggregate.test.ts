import { describe, expect, it } from "vitest";
import {
  AGGREGATE_CAVEATS, AggregationAuditSchema, AggregationConfigSchema, ObservationAggregateSchema, aggregateObservations,
} from "./observation-aggregate";

// Synthetic fixtures only. Nothing here describes a real report, place, event, or person.
const now = "2026-01-01T02:00:00Z";
const config = {
  configVersion: "synthetic-test-config", algorithm: "coarse-cell-count-bin", cellSizeDegrees: 0.02,
  timeBinSeconds: 3600, maxAgeSeconds: 6 * 3600, minReportsPerCell: 3, countCap: 10,
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
const run = (observations: unknown[], moderation: unknown = attested, extra: Partial<typeof config> = {}, rightsReviewed = true) =>
  aggregateObservations({ now, config: { ...config, ...extra }, moderation, rightsReviewed, observations });

/** Per-report precision (ids, points, text, exact clocks) must be absent from the public half, whatever its state. */
function expectNoPerReportDetail(aggregate: unknown, offered: Record<string, unknown>[]) {
  const serialized = JSON.stringify(aggregate);
  for (const item of offered) {
    expect(serialized).not.toContain(String(item.id));
    for (const key of ["observedAt", "publishedAt"]) {
      const value = item[key];
      if (typeof value === "string") expect(serialized).not.toContain(value.replace(/Z$/, ""));
    }
    // Points finer than a cell: only multi-digit fractions can indicate a leak; single digits appear in config.
    if (Array.isArray(item.approximatePoint)) for (const n of item.approximatePoint) {
      if (String(n).length > 3) expect(serialized).not.toContain(String(n));
    }
  }
  expect(serialized).not.toContain("synthetic-id-");
  expect(serialized).not.toContain("SYNTHETIC REPORT TEXT ONLY");
  for (const forbidden of ["inputObservationIds", "private-audit", "approximatePoint", "precisionMeters", "sourceTimes",
    "oldestPublishedAt", "newestPublishedAt", "Polygon", "excluded\""]) expect(serialized).not.toContain(forbidden);
  // Any timestamp in the public half must sit on a time-bin edge, except the moderation attestation itself.
  const times = [...serialized.matchAll(/"(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)"/g)].map((m) => m[1]!);
  for (const time of times) {
    if (time === now || time === attested.attestedAt) continue;
    expect(Date.parse(time) % (config.timeBinSeconds * 1000)).toBe(0);
  }
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
    expect(Object.keys(aggregate.provenance).sort()).toEqual(["config", "moderation", "rightsReviewed"]);
    expectNoPerReportDetail(aggregate, offered);
    expect(audit.inputObservationIds).toEqual(offered.map((item) => item.id).sort());
    expect(audit.offeredObservationCount).toBe(3);
  });

  it("publishes a coarse cell per hazard kind and time bin, and never a point, polygon, text or id", () => {
    const offered = [
      observation(), observation({ approximatePoint: [0.129999, 0.650001] }), observation(),
      ...Array.from({ length: 6 }, () => observation({ topic: "road-obstruction" })),
      observation({ topic: "flooding", observedAt: "2026-01-01T00:10:00Z" }), observation({ topic: "flooding", observedAt: "2026-01-01T00:50:00Z" }),
      observation({ topic: "flooding", observedAt: "2026-01-01T00:59:00Z" }),
      observation({ topic: "wind-damage" }), observation({ topic: "wind-damage" }), // two in a cell/kind/bin -> withheld, not hinted
    ];
    const { aggregate } = run(offered);
    expect(ObservationAggregateSchema.safeParse(aggregate).success).toBe(true);
    expect(aggregate.state).toBe("published");
    if (aggregate.state !== "published") return;
    expect(aggregate.cells.map((cell) => [cell.hazardKind, cell.reportCount, cell.countBin])).toEqual([
      ["flooding", 3, "3-5"], ["road-obstruction", 6, "6-9"], ["smoke", 3, "3-5"],
    ]);
    expect(aggregate.withheldCellCount).toBe(1);
    const cell = aggregate.cells[0]!;
    expect(cell.cellId).toBe("cell:0.02:6:32");
    expect(cell.cellBounds).toEqual([[0.12, 0.64], [0.14, 0.66]]);
    expect(cell.timeBinStart).toBe("2026-01-01T00:00:00.000Z");
    expect(cell.timeBinEnd).toBe("2026-01-01T01:00:00.000Z");
    expect(cell.verification).toBe("unverified");
    expect(Object.keys(cell).sort()).toEqual(["cellBounds", "cellId", "countBin", "countSaturated", "hazardKind", "reportCount", "timeBinEnd", "timeBinStart", "verification"]);
    expectNoPerReportDetail(aggregate, offered);
    expect(aggregate.usage).toEqual({ routingHazardInput: false, officialAuthority: false, boundaryOrModelEstimate: false });
    expect(aggregate.caveats).toEqual(AGGREGATE_CAVEATS);
    expect(aggregate.provenance.uniqueReporterDedupe).toBe("not-possible");
    expect(aggregate.provenance.sourceWindow).toEqual({ start: "2026-01-01T00:00:00.000Z", end: "2026-01-01T02:00:00.000Z" });
    const { audit } = run(offered);
    expect(audit.sourceTimes.earliestObservedAt).toBe("2026-01-01T00:10:00.000Z");
    expect(audit.sourceTimes.latestPublishedAt).toBe("2026-01-01T01:30:00.000Z");
  });

  it("saturates counts so volume cannot escalate", () => {
    const many = Array.from({ length: 14 }, () => observation());
    const { aggregate, audit } = run(many);
    expect(aggregate.state).toBe("published");
    if (aggregate.state !== "published") return;
    expect(aggregate.cells[0]).toMatchObject({ reportCount: 10, countSaturated: true, countBin: "10+" });
    expect(aggregate.provenance.countedObservationCount).toBe(14);
    expect(aggregate.provenance.offeredObservationCount).toBe(14);
    expect(audit.excluded).toEqual([]);
  });

  it("rejects the whole input on a repeated id, whatever the order or eligibility of the copies", () => {
    const valid = observation();
    const outside = { ...observation(), id: valid.id, approximatePoint: [5, 5] };
    const others = [observation(), observation()];
    expect(() => run([valid, outside, ...others])).toThrow(/duplicate observation id/);
    expect(() => run([outside, valid, ...others])).toThrow(/duplicate observation id/);
    expect(() => run([...others, { ...valid }, valid])).toThrow(/duplicate observation id/);
    expect(run([valid, ...others]).aggregate.state).toBe("published");
  });

  it("excludes each ineligible observation with a named reason, publicly as nothing when withheld", () => {
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
    for (const key of ["offeredObservationCount", "countedObservationCount", "exclusionCounts", "sourceWindow", "withheldCellCount"]) {
      expect(JSON.stringify(aggregate)).not.toContain(key);
    }
    expectNoPerReportDetail(aggregate, offered);
    expect(audit.countedObservationCount).toBe(0);
    expect(audit.excluded.map((item) => item.reason)).toEqual([
      "no-public-point", "precision-coarser-than-cell", "outside-coverage", "expired", "future-dated", "published-after-attestation",
    ]);
  });

  it("withholds when every cell is under the threshold and reports only how many", () => {
    const offered = [observation(), observation(), observation({ topic: "fire" }), observation({ topic: "fire" })];
    const { aggregate, audit } = run(offered, attested, { minReportsPerCell: 4 });
    expect(aggregate).toMatchObject({ state: "withheld", reason: "all-cells-below-threshold" });
    expect(JSON.stringify(aggregate)).not.toContain("cell:");
    expect(JSON.stringify(aggregate)).not.toContain("withheldCellCount");
    expectNoPerReportDetail(aggregate, offered);
    expect(audit.withheldCellCount).toBe(2);
  });

  it("withholds when rights are not reviewed, and a published aggregate cannot claim otherwise", () => {
    const offered = [observation(), observation(), observation()];
    const { aggregate } = run(offered, attested, {}, false);
    expect(aggregate).toMatchObject({ state: "withheld", reason: "rights-unreviewed", cells: [] });
    expectNoPerReportDetail(aggregate, offered);
    const published = run(offered).aggregate;
    expect(ObservationAggregateSchema.safeParse({ ...published, provenance: { ...published.provenance, rightsReviewed: false } }).success).toBe(false);
    expect(ObservationAggregateSchema.safeParse({ ...published, provenance: { ...published.provenance, moderation: { status: "missing", detail: "x" } } }).success).toBe(false);
  });

  it("keeps the audit as a separate, explicitly private object", () => {
    const { aggregate, audit } = run([observation(), observation(), observation()]);
    expect(AggregationAuditSchema.safeParse(audit).success).toBe(true);
    expect(audit.audience).toBe("private-audit");
    expect(ObservationAggregateSchema.safeParse({ ...aggregate, audit }).success).toBe(false);
    expect(ObservationAggregateSchema.safeParse({ ...aggregate, provenance: { ...aggregate.provenance, inputObservationIds: [] } }).success).toBe(false);
    expect(ObservationAggregateSchema.safeParse({ ...aggregate, provenance: { ...aggregate.provenance, sourceTimes: audit.sourceTimes } }).success).toBe(false);
    if (aggregate.state !== "published") return;
    expect(ObservationAggregateSchema.safeParse({ ...aggregate, cells: [{ ...aggregate.cells[0], newestPublishedAt: now }] }).success).toBe(false);
    expect(ObservationAggregateSchema.safeParse({ ...aggregate, state: "withheld", reason: "missing-moderation", cells: [] }).success).toBe(false);
  });

  it("rejects private marks, raw submissions, official notices and a fake all-clear", () => {
    const mark = { id: "mark-1", lat: 0.1, lng: 0.1, placedAt: now };
    expect(() => run([mark])).toThrow();
    expect(() => run([observation({ verification: "official" })])).toThrow();
    expect(() => run([observation({ kind: "official-notice" })])).toThrow();
    expect(() => run([observation({ redactedText: undefined })])).toThrow();
    const { aggregate } = run([observation(), observation(), observation()]);
    expect(ObservationAggregateSchema.safeParse({ ...aggregate, allClear: true }).success).toBe(false);
    expect(ObservationAggregateSchema.safeParse({ ...aggregate, usage: { ...aggregate.usage, routingHazardInput: true } }).success).toBe(false);
    expect(ObservationAggregateSchema.safeParse({ ...aggregate, state: "published", cells: [] }).success).toBe(false);
    expect(ObservationAggregateSchema.safeParse({ ...aggregate, caveats: { ...aggregate.caveats, notAllClear: "all clear" } }).success).toBe(false);
  });

  it("bounds the configuration so cells stay coarse and windows stay short", () => {
    expect(AggregationConfigSchema.safeParse(config).success).toBe(true);
    expect(AggregationConfigSchema.safeParse({ ...config, cellSizeDegrees: 0.001 }).success).toBe(false);
    expect(AggregationConfigSchema.safeParse({ ...config, minReportsPerCell: 2 }).success).toBe(false);
    expect(AggregationConfigSchema.safeParse({ ...config, minReportsPerCell: 3 }).success).toBe(true);
    expect(AggregationConfigSchema.safeParse({ ...config, minReportsPerCell: 11 }).success).toBe(false);
    expect(AggregationConfigSchema.safeParse({ ...config, coverage: { description: "x", bounds: [[1, 1], [-1, -1]] } }).success).toBe(false);
    expect(AggregationConfigSchema.safeParse({ ...config, configVersion: "" }).success).toBe(false);
  });

  it("is deterministic across every permutation of eligible and ineligible inputs, audit included", () => {
    const inputs = [
      observation(), observation({ approximatePoint: [5, 5] }), observation(),
      observation({ observedAt: "2025-12-31T10:00:00Z" }), observation(),
    ];
    const permutations = (items: typeof inputs): (typeof inputs)[] => items.length <= 1 ? [items]
      : items.flatMap((item, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]));
    const reference = run(inputs);
    expect(reference.aggregate.state).toBe("published");
    for (const order of permutations(inputs)) expect(run(order)).toEqual(reference);
    expect(reference.audit.excluded.map((item) => item.id)).toEqual([inputs[1]!.id, inputs[3]!.id].sort());
  });

  it("treats coverage as half-open so no published cell can extend beyond it, on every edge", () => {
    const square = { cellSizeDegrees: 0.5, coverage: { description: "SYNTHETIC TEST ONLY", bounds: [[-1, -1], [1, 1]] } };
    const cellsFor = (point: [number, number]) => {
      const { aggregate } = run([observation({ approximatePoint: point }), observation({ approximatePoint: point }), observation({ approximatePoint: point })], attested, square);
      return aggregate.state === "published" ? aggregate.cells.map((cell) => cell.cellBounds) : aggregate.reason;
    };
    expect(cellsFor([1, 1])).toBe("no-eligible-observations");
    expect(cellsFor([1, 0])).toBe("no-eligible-observations");
    expect(cellsFor([0, 1])).toBe("no-eligible-observations");
    expect(cellsFor([0.999999, 0.999999])).toEqual([[[0.5, 0.5], [1, 1]]]);
    expect(cellsFor([-1, -1])).toEqual([[[-1, -1], [-0.5, -0.5]]]);
    expect(cellsFor([-0.25, 0.75])).toEqual([[[-0.5, 0.5], [0, 1]]]);
    expect(cellsFor([-1.000001, 0])).toBe("no-eligible-observations");
    expect(cellsFor([0, -1.000001])).toBe("no-eligible-observations");
    for (const point of [[-1, -1], [-0.5, 0.5], [0.999999, -1], [0, 0]] as [number, number][]) {
      const bounds = cellsFor(point);
      expect(Array.isArray(bounds)).toBe(true);
      if (!Array.isArray(bounds)) continue;
      for (const [[w, s], [e, n]] of bounds) {
        expect(w).toBeGreaterThanOrEqual(-1); expect(s).toBeGreaterThanOrEqual(-1);
        expect(e).toBeLessThanOrEqual(1); expect(n).toBeLessThanOrEqual(1);
      }
    }
    expect(AggregationConfigSchema.safeParse({ ...config, ...square, coverage: { description: "x", bounds: [[-1, -1], [0.75, 1]] } }).success).toBe(false);
  });
});
