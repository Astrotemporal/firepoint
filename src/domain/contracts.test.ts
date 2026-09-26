import { describe, expect, it } from "vitest";
import {
  EvacuationZoneSchema, NoticeFeedSchema, OfficialNoticeSchema, PlaceQuerySchema,
  PublishedObservationSchema, SourceCheckSchema, StandingHazardSchema, SubmissionReceiptSchema,
} from "./contracts";

// Synthetic fixtures below are test-only. They are never imported by the app.
const clock = "2026-01-01T00:00:00Z";
const origin = { operator: "Synthetic Agency Adapter", issuer: "Synthetic Agency", recordId: "synthetic-1",
  recordUrl: "https://example.org/synthetic-record", retrievedAt: clock, issuedAt: null, updatedAt: null };
const healthy = { sourceKey: "synthetic-source", operator: "Synthetic Agency Adapter", endpoint: "https://example.org/synthetic-feed",
  applicable: true, status: "ok", lastAttemptAt: clock, lastSuccessAt: clock, sourceAsOf: null,
  staleAfterSeconds: 120, detail: null };

const notice = { kind: "official-notice", category: "weather", headline: "SYNTHETIC TEST ONLY",
  description: null, instructions: null, startsAt: null, endsAt: null, issuerStatus: "unknown",
  match: "publisher-point-filter", areaDescription: null, origin };

describe("Firepoint data contract", () => {
  it("preserves no-all-clear and per-source health even with zero notices", () => {
    expect(SourceCheckSchema.safeParse(healthy).success).toBe(true);
    expect(SourceCheckSchema.safeParse({ ...healthy, lastSuccessAt: null }).success).toBe(false);
    const response = { version: 1, generatedAt: clock, sourceChecks: [healthy], notices: [], allClear: false };
    expect(NoticeFeedSchema.safeParse(response).success).toBe(true);
    expect(NoticeFeedSchema.safeParse({ ...response, allClear: true }).success).toBe(false);
    expect(NoticeFeedSchema.safeParse({ ...response, sourceChecks: [], notices: [notice] }).success).toBe(false);
    expect(OfficialNoticeSchema.safeParse(notice).success).toBe(true);
    expect(OfficialNoticeSchema.safeParse({ ...notice, origin: { ...origin, recordUrl: "" } }).success).toBe(false);
  });

  it("cannot turn a neighborhood, unknown footprint or report into a verified zone", () => {
    expect(EvacuationZoneSchema.safeParse({ result: "unavailable", reason: "No verified standing-zone source", officialLookupUrl: null }).success).toBe(true);
    expect(EvacuationZoneSchema.safeParse({ result: "verified", zoneId: "synthetic-zone" }).success).toBe(false);
    const hazard = { kind: "standing-hazard", dataset: "synthetic-map", classification: null,
      lookup: "outside", coverage: "unknown", caveat: "SYNTHETIC TEST ONLY", origin };
    expect(StandingHazardSchema.safeParse(hazard).success).toBe(false);
    expect(StandingHazardSchema.safeParse({ ...hazard, coverage: "verified" }).success).toBe(true);
    const report = { kind: "community-observation", id: "synthetic-report", topic: "smoke", redactedText: "SYNTHETIC TEST ONLY",
      observedAt: null, publishedAt: clock, approximatePoint: null, precisionMeters: null, verification: "unverified" };
    expect(PublishedObservationSchema.safeParse(report).success).toBe(true);
    expect(PublishedObservationSchema.safeParse({ ...report, verification: "official" }).success).toBe(false);
    expect(SubmissionReceiptSchema.safeParse({ receiptId: "synthetic-receipt", receivedAt: clock, disposition: "awaiting-moderation", emergencyDispatch: true }).success).toBe(false);
  });

  it("validates precise coordinates and requires an explicit user action", () => {
    expect(PlaceQuerySchema.safeParse({ point: [-118.25, 34.15], userInitiated: true }).success).toBe(true);
    expect(PlaceQuerySchema.safeParse({ point: [34.15, -118.25], userInitiated: true }).success).toBe(false);
    expect(PlaceQuerySchema.safeParse({ point: [-118.25, 34.15], userInitiated: false }).success).toBe(false);
  });
});
