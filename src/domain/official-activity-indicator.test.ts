import { describe, expect, it } from "vitest";
import {
  OFFICIAL_ACTIVITY_INDICATOR_LEGEND, OFFICIAL_ACTIVITY_INDICATOR_STYLE, officialActivityIndicatorLayer,
} from "./official-activity-indicator";

// Synthetic fixtures only. Nothing here describes a real incident, evacuation, agency action, or source.
const record = {
  kind: "official-activity-indicator-record" as const,
  status: "active" as const,
  activity: "incident" as const,
  issuer: "SYNTHETIC TEST AGENCY",
  sourceUrl: "https://example.invalid/synthetic-official-record",
  recordId: "synthetic-official-1",
  issuedAt: "2026-01-01T01:00:00Z",
  updatedAt: "2026-01-01T01:30:00Z",
  retrievedAt: "2026-01-01T01:31:00Z",
  geometry: { type: "Point" as const, coordinates: [0.12, 0.34] as [number, number] },
  caveat: "SYNTHETIC TEST ONLY",
};

describe("official activity indicator policy", () => {
  it("builds fixed-size red hollow badges only for active official records with source, times and geometry", () => {
    const result = officialActivityIndicatorLayer([record], { now: "2026-01-01T02:00:00Z", maxAgeSeconds: 3600 });
    expect(result.state).toBe("ready");
    if (result.state !== "ready") return;
    expect(result.layer.legend).toBe(OFFICIAL_ACTIVITY_INDICATOR_LEGEND);
    expect(result.layer.drawing).toBe("fixed-size-red-hollow-circle-badges");
    expect(result.layer.routeCoupling).toBe(false);
    expect(result.layer.officialAuthority).toBe(true);
    expect(result.layer.boundaryOrRadius).toBe(false);
    expect(result.layer.badges).toHaveLength(1);
    expect(result.layer.badges[0]).toMatchObject({
      kind: "official-activity-badge",
      center: { lng: 0.12, lat: 0.34 },
      activity: "incident",
      issuer: "SYNTHETIC TEST AGENCY",
      sourceUrl: "https://example.invalid/synthetic-official-record",
      issuedAt: "2026-01-01T01:00:00Z",
      updatedAt: "2026-01-01T01:30:00Z",
      retrievedAt: "2026-01-01T01:31:00Z",
      style: OFFICIAL_ACTIVITY_INDICATOR_STYLE,
    });
    expect(result.layer.badges[0]!.style.badgeSizePx).toBe(28);
    expect(result.layer.badges[0]!.style.strokeColor).toBe("#dc2626");
    expect(result.layer.badges[0]!.detail).toContain("Follow the source");
  });

  it("fails closed when official authority, status, source, times, geometry or freshness is missing", () => {
    expect(officialActivityIndicatorLayer(null, { now: "2026-01-01T02:00:00Z", maxAgeSeconds: 3600 })).toEqual({
      state: "empty", reason: "absent", layer: null,
    });
    expect(officialActivityIndicatorLayer([{ ...record, status: "ended" }], { now: "2026-01-01T02:00:00Z", maxAgeSeconds: 3600 })).toEqual({
      state: "empty", reason: "malformed", layer: null,
    });
    expect(officialActivityIndicatorLayer([{ ...record, sourceUrl: null }], { now: "2026-01-01T02:00:00Z", maxAgeSeconds: 3600 })).toEqual({
      state: "empty", reason: "malformed", layer: null,
    });
    expect(officialActivityIndicatorLayer([{ ...record, geometry: null }], { now: "2026-01-01T02:00:00Z", maxAgeSeconds: 3600 })).toEqual({
      state: "empty", reason: "malformed", layer: null,
    });
    expect(officialActivityIndicatorLayer([record], { now: "2026-01-01T03:00:01Z", maxAgeSeconds: 3600 })).toEqual({
      state: "empty", reason: "no-active-official-records", layer: null,
    });
  });
});
