import { describe, expect, it } from "vitest";
import { buildHazardFeed } from "./hazard-feed";
import type { GisHazardsResult } from "@/server/glendale-gis";

const checkedAt = "2026-09-26T12:00:00.000Z";
// Deliberately synthetic test-only layers, never UI sample data.
const unavailable = (coverage: "unknown" | "out-of-bounds") => ({
  kind: "standing-hazard" as const, hazard: "wildfire" as const, dataset: "SYNTHETIC TEST LAYER",
  classification: null, lookup: "unavailable" as const, coverage, caveat: "SYNTHETIC TEST ONLY",
  origin: { operator: "Synthetic", issuer: null, recordId: "test-only", recordUrl: "https://example.org/test",
    retrievedAt: checkedAt, issuedAt: null, updatedAt: null },
});
const result = (coverage: "unknown" | "out-of-bounds"): Extract<GisHazardsResult, { status: "ok" }> => ({
  status: "ok", checkedAt, snapshotAsOf: null, anyStale: false, inCity: false,
  hazards: [unavailable(coverage)],
});

describe("hazard snapshot availability", () => {
  it("marks missing-layer outage down, never outside the map", () => {
    const feed = buildHazardFeed(result("unknown"), checkedAt);
    expect(feed.sourceChecks[0]).toMatchObject({ status: "down", lastSuccessAt: null });
    expect(feed.sourceChecks[0]?.detail).not.toContain("outside");
    expect(feed.allClear).toBe(false);
  });
  it("marks explicitly out-of-bounds point outside coverage", () => {
    const feed = buildHazardFeed(result("out-of-bounds"), checkedAt);
    expect(feed.sourceChecks[0]?.status).toBe("outside-coverage");
    expect(feed.sourceChecks[0]?.lastSuccessAt).toBe(checkedAt);
    expect(feed.sourceChecks[0]?.detail).toContain("outside");
  });
  it("does not treat a successful-but-empty snapshot as outside coverage", () => {
    const feed = buildHazardFeed({ ...result("unknown"), hazards: [] }, checkedAt);
    expect(feed.sourceChecks[0]?.status).toBe("down");
  });
});
