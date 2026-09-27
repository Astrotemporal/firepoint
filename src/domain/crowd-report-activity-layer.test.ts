import { describe, expect, it } from "vitest";
import { aggregateObservations } from "./observation-aggregate";
import {
  CROWD_REPORT_ACTIVITY_LEGEND, CROWD_REPORT_ACTIVITY_STYLE, crowdReportActivityLayer, unreviewedReportActivityLayer,
} from "./crowd-report-activity-layer";
import { officialActivityIndicatorLayer } from "./official-activity-indicator";

// Synthetic fixtures only. Nothing here describes a real report, place, event, person, or agency action.
const now = "2026-01-01T02:00:00Z";
const config = {
  configVersion: "synthetic-display-config",
  algorithm: "coarse-cell-count-bin" as const,
  cellSizeDegrees: 0.02,
  timeBinSeconds: 3600,
  maxAgeSeconds: 6 * 3600,
  minReportsPerCell: 3,
  countCap: 10,
  coverage: { description: "SYNTHETIC TEST ONLY", bounds: [[-1, -1], [1, 1]] as [[number, number], [number, number]] },
};
const moderation = {
  status: "attested" as const,
  queueId: "synthetic-queue",
  policyVersion: "synthetic-policy-0",
  ownerRole: "synthetic-moderation-owner",
  attestedAt: "2026-01-01T01:59:00Z",
};
let counter = 0;
function observation(overrides: Record<string, unknown> = {}) {
  counter += 1;
  return {
    kind: "community-observation", id: `synthetic-report-${counter}`, topic: "smoke", redactedText: "SYNTHETIC REPORT TEXT ONLY",
    observedAt: "2026-01-01T01:20:00Z", publishedAt: "2026-01-01T01:30:00Z",
    approximatePoint: [0.123456, 0.654321], precisionMeters: 500, verification: "unverified", ...overrides,
  };
}
function aggregate(count: number, rightsReviewed = true) {
  return aggregateObservations({
    now, config, moderation, rightsReviewed,
    observations: Array.from({ length: count }, () => observation()),
  }).aggregate;
}

describe("crowdsourced report activity layer", () => {
  it("builds fixed-size yellow hollow badges only from a published moderated aggregate", () => {
    const result = crowdReportActivityLayer(aggregate(3), { now: "2026-01-01T02:01:00Z", maxAgeSeconds: 3600 });
    expect(result.state).toBe("ready");
    if (result.state !== "ready") return;
    expect(result.layer.legend).toBe(CROWD_REPORT_ACTIVITY_LEGEND);
    expect(result.layer.drawing).toBe("fixed-size-yellow-hollow-circle-badges");
    expect(result.layer.routeCoupling).toBe(false);
    expect(result.layer.officialAuthority).toBe(false);
    expect(result.layer.boundaryOrRadius).toBe(false);
    expect(result.layer.badges).toHaveLength(1);
    expect(result.layer.badges[0]).toMatchObject({
      kind: "crowdsourced-report-activity-badge",
      center: { lng: 0.13, lat: 0.65 },
      hazardKind: "smoke",
      reportCount: 3,
      verification: "unverified",
      style: CROWD_REPORT_ACTIVITY_STYLE,
    });
    expect(result.layer.badges[0]!.detail).toContain("not unique people");
    expect(result.layer.badges[0]!.detail).toContain("not a fire perimeter or evacuation order");
    expect(result.layer.mapbox.layers[0].paint["circle-radius"]).toBe(CROWD_REPORT_ACTIVITY_STYLE.badgeSizePx / 2);
    expect(result.layer.mapbox.layers[0].paint["circle-color"]).toBe("transparent");
    expect(result.layer.mapbox.layers[0].paint["circle-stroke-color"]).toBe("#facc15");
    expect(JSON.stringify(result.layer)).not.toContain("synthetic-report-");
    expect(JSON.stringify(result.layer)).not.toContain("SYNTHETIC REPORT TEXT ONLY");
    expect(JSON.stringify(result.layer)).not.toContain("0.123456");
    expect(JSON.stringify(result.layer)).not.toContain("0.654321");
  });

  it("keeps badge size equal regardless of capped report count", () => {
    const low = crowdReportActivityLayer(aggregate(3), { now: "2026-01-01T02:01:00Z", maxAgeSeconds: 3600 });
    const high = crowdReportActivityLayer(aggregate(25), { now: "2026-01-01T02:01:00Z", maxAgeSeconds: 3600 });
    expect(low.state).toBe("ready");
    expect(high.state).toBe("ready");
    if (low.state !== "ready" || high.state !== "ready") return;
    expect(low.layer.badges[0]!.style.badgeSizePx).toBe(high.layer.badges[0]!.style.badgeSizePx);
    expect(high.layer.badges[0]!.reportCount).toBe(10);
    expect(high.layer.badges[0]!.countSaturated).toBe(true);
    expect(high.layer.badges[0]!.style.strokeColor).toBe("#facc15");
  });

  it("fails closed for absent, withheld, malformed and stale aggregate inputs", () => {
    expect(crowdReportActivityLayer(null, { now, maxAgeSeconds: 3600 })).toEqual({ state: "empty", reason: "absent", layer: null });
    expect(crowdReportActivityLayer(aggregate(3, false), { now, maxAgeSeconds: 3600 })).toEqual({ state: "empty", reason: "withheld", layer: null });
    expect(crowdReportActivityLayer({ state: "published", cells: "not cells" }, { now, maxAgeSeconds: 3600 })).toEqual({ state: "empty", reason: "malformed", layer: null });
    expect(crowdReportActivityLayer(aggregate(3), { now: "2026-01-01T04:00:01Z", maxAgeSeconds: 3600 })).toEqual({ state: "empty", reason: "stale", layer: null });
  });

  it("never turns crowdsourced report volume into a red official indicator", () => {
    const yellow = crowdReportActivityLayer(aggregate(25), { now: "2026-01-01T02:01:00Z", maxAgeSeconds: 3600 });
    expect(yellow.state).toBe("ready");
    if (yellow.state !== "ready") return;
    expect(JSON.stringify(yellow.layer)).not.toContain("#dc2626");
    expect(officialActivityIndicatorLayer([aggregate(25)], { now, maxAgeSeconds: 3600 })).toEqual({
      state: "empty", reason: "malformed", layer: null,
    });
  });
});


describe("unreviewed report activity layer", () => {
  const unreviewedInput = {
    version: 1,
    kind: "unreviewed-report-activity",
    generatedAt: "2026-01-01T02:00:00Z",
    allClear: false,
    verification: "unreviewed",
    uniqueReporterDedupe: "not-possible",
    producer: {
      system: "synthetic-server-aggregator",
      configVersion: "synthetic-unreviewed-v0",
      retentionPolicyVersion: "synthetic-retention-v0",
      consentPolicyVersion: "synthetic-consent-v0",
    },
    usage: { routingHazardInput: false, officialAuthority: false, boundaryOrModelEstimate: false },
    cells: [{
      cellId: "synthetic-cell-1",
      cellBounds: [[0.12, 0.64], [0.14, 0.66]],
      hazardKind: "smoke",
      timeBinStart: "2026-01-01T01:00:00Z",
      timeBinEnd: "2026-01-01T02:00:00Z",
      reportCount: 3,
      countSaturated: false,
      verification: "unreviewed",
    }],
  };

  it("supports a separate yellow policy for server-produced 3+ unreviewed coarse-cell counts", () => {
    const result = unreviewedReportActivityLayer(unreviewedInput, { now: "2026-01-01T02:01:00Z", maxAgeSeconds: 3600 });
    expect(result.state).toBe("ready");
    if (result.state !== "ready") return;
    expect(result.layer.legend).toBe(CROWD_REPORT_ACTIVITY_LEGEND);
    expect(result.layer.officialAuthority).toBe(false);
    expect(result.layer.routeCoupling).toBe(false);
    expect(result.layer.boundaryOrRadius).toBe(false);
    expect(result.layer.source).toMatchObject({
      label: "server-produced unreviewed report activity",
      configVersion: "synthetic-unreviewed-v0",
      uniqueReporterDedupe: "not-possible",
    });
    expect(result.layer.badges[0]).toMatchObject({
      center: { lng: 0.13, lat: 0.65 },
      reportCount: 3,
      verification: "unreviewed",
      label: "3+ unreviewed reports",
      detail: "3+ unreviewed reports — may be repeats, not a confirmed hazard",
      style: CROWD_REPORT_ACTIVITY_STYLE,
    });
    expect(result.layer.mapbox.layers[0].paint["circle-stroke-color"]).toBe("#facc15");
    expect(JSON.stringify(result.layer)).not.toContain("synthetic-report-");
  });

  it("fails closed for unreviewed counts below threshold, raw-looking locations, stale data, and official color escalation", () => {
    expect(unreviewedReportActivityLayer({ ...unreviewedInput, cells: [{ ...unreviewedInput.cells[0], reportCount: 2 }] }, {
      now: "2026-01-01T02:01:00Z", maxAgeSeconds: 3600,
    })).toEqual({ state: "empty", reason: "malformed", layer: null });
    expect(unreviewedReportActivityLayer({ ...unreviewedInput, cells: [{ ...unreviewedInput.cells[0], approximatePoint: [0.123456, 0.654321] }] }, {
      now: "2026-01-01T02:01:00Z", maxAgeSeconds: 3600,
    })).toEqual({ state: "empty", reason: "malformed", layer: null });
    expect(unreviewedReportActivityLayer(unreviewedInput, { now: "2026-01-01T04:00:01Z", maxAgeSeconds: 3600 })).toEqual({
      state: "empty", reason: "stale", layer: null,
    });
    const ready = unreviewedReportActivityLayer({ ...unreviewedInput, cells: [{ ...unreviewedInput.cells[0], reportCount: 20, countSaturated: true }] }, {
      now: "2026-01-01T02:01:00Z", maxAgeSeconds: 3600,
    });
    expect(ready.state).toBe("ready");
    if (ready.state !== "ready") return;
    expect(JSON.stringify(ready.layer)).not.toContain("#dc2626");
  });
});
