import { describe, expect, it } from "vitest";
import { asNwsNoticeFeed, unconfiguredNwsFeed } from "./notice-feed";

// All records are deliberately synthetic and test-only.
const timestamp = "2026-01-01T00:00:00Z";
describe("NWS to Firepoint contract", () => {
  it("preserves upstream text and source while refusing an all-clear", () => {
    const feed = asNwsNoticeFeed({ status: "ok", checkedAt: timestamp,
      sourceUrl: "https://api.weather.gov/alerts/active?point=34.15%2C-118.25", pointFiltered: true,
      alerts: [{ id: "synthetic-alert", url: "https://api.weather.gov/alerts/synthetic-alert",
        sent: timestamp, updated: timestamp, expires: "2026-01-01T01:00:00Z",
        ends: "2026-01-01T02:00:00Z", status: "Actual", event: "Synthetic event",
        headline: "SYNTHETIC TEST ONLY", description: "Synthetic text", instruction: null, areaDesc: "Synthetic area" }] }, timestamp);
    expect(feed.notices[0]?.headline).toBe("SYNTHETIC TEST ONLY");
    expect(feed.notices[0]?.origin.issuer).toBeNull();
    expect(feed.notices[0]?.match).toBe("publisher-point-filter");
    expect(feed.notices[0]?.endsAt).toBe("2026-01-01T02:00:00Z"); // NOT message expiry at 01:00.
    expect(feed.sourceChecks[0]?.endpoint).not.toContain("point=");
    expect(feed.allClear).toBe(false);
  });
  it("excludes test/exercise messages and never treats message expiry as event end", () => {
    const feed = asNwsNoticeFeed({ status: "ok", checkedAt: timestamp,
      sourceUrl: "https://api.weather.gov/alerts/active", pointFiltered: true,
      alerts: ["Test", "Exercise", "Actual"].map((status, index) => ({
        id: `synthetic-${index}`, url: `https://api.weather.gov/alerts/synthetic-${index}`,
        sent: timestamp, updated: timestamp, expires: "2026-01-01T01:00:00Z",
        status: status as "Test" | "Exercise" | "Actual", event: "Synthetic event",
        headline: "SYNTHETIC ONLY", description: "Synthetic text", instruction: null,
        areaDesc: "Synthetic area",
      })) }, timestamp);
    expect(feed.notices).toHaveLength(1);
    expect(feed.notices[0]?.origin.recordId).toBe("synthetic-2");
    expect(feed.notices[0]?.endsAt).toBeNull();
    expect(feed.allClear).toBe(false);
  });

  it("does not manufacture a notice on an empty or failed source", () => {
    const empty = asNwsNoticeFeed({ status: "ok", checkedAt: timestamp,
      sourceUrl: "https://api.weather.gov/alerts/active", pointFiltered: true, alerts: [] }, timestamp);
    expect(empty.notices).toEqual([]);
    expect(empty.allClear).toBe(false);
    const failure = asNwsNoticeFeed({ status: "unavailable", attemptedAt: timestamp,
      sourceUrl: "https://api.weather.gov/alerts/active", pointFiltered: true, reason: "network_error" }, timestamp);
    expect(failure.sourceChecks[0]?.status).toBe("down");
    expect(failure.sourceChecks[0]?.lastSuccessAt).toBeNull();
    expect(failure.notices).toEqual([]);
    expect(unconfiguredNwsFeed(timestamp).sourceChecks[0]?.status).toBe("not-configured");
  });
});
