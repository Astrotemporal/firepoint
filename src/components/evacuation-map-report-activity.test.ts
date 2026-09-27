import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CROWD_REPORT_ACTIVITY_STYLE,
  unreviewedReportActivityLayer,
  type UnreviewedReportActivityResult,
} from "@/domain/crowd-report-activity-layer";

// ─── Synthetic fixtures ────────────────────────────────────────────────────────
// Nothing here describes a real report, place, event, person, or agency action.
const BASE_NOW = "2026-06-01T12:00:00Z";
const OPTS = { now: BASE_NOW, maxAgeSeconds: 3600 };

const SYNTHETIC_CELL = {
  cellId: "synthetic-dormant-test-cell-1",
  cellBounds: [[0.10, 0.60], [0.14, 0.64]] as [[number, number], [number, number]],
  hazardKind: "smoke" as const,
  timeBinStart: "2026-06-01T11:00:00Z",
  timeBinEnd: "2026-06-01T12:00:00Z",
  reportCount: 3,
  countSaturated: false,
  verification: "unreviewed" as const,
};

const SYNTHETIC_INPUT = {
  version: 1 as const,
  kind: "unreviewed-report-activity" as const,
  generatedAt: BASE_NOW,
  allClear: false as const,
  verification: "unreviewed" as const,
  uniqueReporterDedupe: "not-possible" as const,
  producer: {
    system: "synthetic-dormant-badge-test",
    configVersion: "synthetic-badge-config-v0",
    retentionPolicyVersion: "synthetic-retention-v0",
    consentPolicyVersion: "synthetic-consent-v0",
  },
  usage: { routingHazardInput: false as const, officialAuthority: false as const, boundaryOrModelEstimate: false as const },
  cells: [SYNTHETIC_CELL],
};

const EMPTY_GEOJSON = { type: "FeatureCollection", features: [] } as const;

/** Pure adapter: map an UnreviewedReportActivityResult to the GeoJSON data for the map source. */
function reportActivitySourceData(
  result: UnreviewedReportActivityResult | null | undefined,
): { type: "FeatureCollection"; features: readonly unknown[] } {
  if (result?.state === "ready") return result.layer.mapbox.source.data;
  return EMPTY_GEOJSON;
}
// ─── Tests ────────────────────────────────────────────────────────────────────

describe("report activity map source adapter (dormant badge)", () => {
  it("returns empty GeoJSON for null (absent) input — no yellow circles by default", () => {
    const absent = unreviewedReportActivityLayer(null, OPTS);
    expect(absent.state).toBe("empty");
    expect(absent.layer).toBeNull();
    expect(reportActivitySourceData(null)).toEqual(EMPTY_GEOJSON);
    expect(reportActivitySourceData(absent)).toEqual(EMPTY_GEOJSON);
    expect(reportActivitySourceData(undefined)).toEqual(EMPTY_GEOJSON);
  });

  it("passes through GeoJSON features for a valid synthetic 3+ unreviewed result", () => {
    const result = unreviewedReportActivityLayer(SYNTHETIC_INPUT, OPTS);
    expect(result.state).toBe("ready");
    if (result.state !== "ready") return;
    const data = reportActivitySourceData(result);
    expect(data.type).toBe("FeatureCollection");
    expect(data.features).toHaveLength(1);
    const feature = data.features[0] as { type: string; geometry: { type: string; coordinates: number[] }; properties: Record<string, unknown> };
    expect(feature.type).toBe("Feature");
    expect(feature.geometry.type).toBe("Point");
    // Center is coarse-cell midpoint; never a raw reporter point.
    expect(feature.geometry.coordinates[0]).toBeCloseTo(0.12, 4);
    expect(feature.geometry.coordinates[1]).toBeCloseTo(0.62, 4);
    expect(feature.properties["verification"]).toBe("unreviewed");
    expect(feature.properties["reportCount"]).toBe(3);
    // No private coordinate leak.
    expect(JSON.stringify(data)).not.toContain("0.123456");
    expect(JSON.stringify(data)).not.toContain("synthetic-dormant-badge-test");
  });

  it("returns empty GeoJSON when count is below 3 (malformed — fails closed)", () => {
    const sub3Input = { ...SYNTHETIC_INPUT, cells: [{ ...SYNTHETIC_CELL, reportCount: 2 }] };
    const result = unreviewedReportActivityLayer(sub3Input, OPTS);
    expect(result.state).toBe("empty");
    expect(result.layer).toBeNull();
    expect(reportActivitySourceData(result)).toEqual(EMPTY_GEOJSON);
  });

  it("returns empty GeoJSON when the aggregate is stale — fails closed", () => {
    const staleOpts = { now: "2026-06-01T14:00:01Z", maxAgeSeconds: 3600 };
    const result = unreviewedReportActivityLayer(SYNTHETIC_INPUT, staleOpts);
    expect(result.state).toBe("empty");
    expect(result.layer).toBeNull();
    expect(reportActivitySourceData(result)).toEqual(EMPTY_GEOJSON);
  });

  it("ready result carries yellow hollow-circle style; never red official color", () => {
    const result = unreviewedReportActivityLayer(SYNTHETIC_INPUT, OPTS);
    expect(result.state).toBe("ready");
    if (result.state !== "ready") return;
    expect(result.layer.mapbox.layers[0].paint["circle-stroke-color"]).toBe(CROWD_REPORT_ACTIVITY_STYLE.strokeColor);
    expect(result.layer.mapbox.layers[0].paint["circle-color"]).toBe("transparent");
    expect(result.layer.mapbox.layers[0].paint["circle-stroke-color"]).toBe("#facc15");
    expect(JSON.stringify(result.layer)).not.toContain("#dc2626");
    // Badges are fixed-pixel size (badgeSizePx / 2 === circle-radius).
    expect(result.layer.mapbox.layers[0].paint["circle-radius"]).toBe(CROWD_REPORT_ACTIVITY_STYLE.badgeSizePx / 2);
  });

  it("layer contract: routeCoupling=false, officialAuthority=false, boundaryOrRadius=false", () => {
    const result = unreviewedReportActivityLayer(SYNTHETIC_INPUT, OPTS);
    expect(result.state).toBe("ready");
    if (result.state !== "ready") return;
    expect(result.layer.routeCoupling).toBe(false);
    expect(result.layer.officialAuthority).toBe(false);
    expect(result.layer.boundaryOrRadius).toBe(false);
  });
});

describe("evacuation-map.tsx source and layer wiring (static audit)", () => {
  it("declares crowdsourced-report-activity source after private-mark-halos and before markers — correct layer order", () => {
    const src = readFileSync("src/components/evacuation-map.tsx", "utf8");
    const halosPos = src.indexOf('"private-mark-halos"');
    const reportSrcPos = src.indexOf('"crowdsourced-report-activity"');
    const badgesLayerPos = src.indexOf('"crowdsourced-report-activity-badges"');
    expect(halosPos, "private-mark-halos must be present").toBeGreaterThan(0);
    expect(reportSrcPos, "crowdsourced-report-activity source must be present").toBeGreaterThan(halosPos);
    expect(badgesLayerPos, "crowdsourced-report-activity-badges layer must follow source").toBeGreaterThan(reportSrcPos);
    // Circle layer appears after route-guides (routes sit beneath badges in draw order).
    const routeGuidesPos = src.indexOf('"route-guides"');
    expect(routeGuidesPos).toBeGreaterThan(0);
    expect(reportSrcPos).toBeGreaterThan(routeGuidesPos);
  });

  it("does not import PR34 backend, PR42 station/escape, or 1200m radius polygon code", () => {
    const src = readFileSync("src/components/evacuation-map.tsx", "utf8");
    expect(src).not.toContain("report-backend");
    expect(src).not.toContain("escape-triage");
    expect(src).not.toContain("1200");
    expect(src).not.toContain("CROWD_REPORT_ACTIVITY_STYLE_LAYER");
  });

  it("public-map-screen passes reportActivity=null explicitly — no live data at public boundary", () => {
    const src = readFileSync("src/components/public-map-screen.tsx", "utf8");
    expect(src).toContain("reportActivity={null}");
    // The public screen never imports the routing or report backend modules.
    expect(src).not.toContain("unreviewedReportActivityLayer");
    expect(src).not.toContain("crowdReportActivityLayer");
    expect(src).not.toContain("report-backend");
  });
});
