import { describe, expect, it } from "vitest";
import type { StandingHazard } from "@/domain/contracts";
import { NO_ALL_CLEAR_COPY, formatDate, formatTime, hazardStatus } from "./live-sources";

describe("source results warning", () => {
  it("cannot invert the all-clear warning with a double negative", () => {
    expect(NO_ALL_CLEAR_COPY).toBe("Nothing listed here is an all-clear.");
    expect(NO_ALL_CLEAR_COPY).not.toMatch(/not an all-clear/);
  });
});

describe("formatDate", () => {
  it("includes the year so old map editions are not mistaken for recent ones", () => {
    expect(formatDate("2025-11-19T17:39:00Z")).toBe("Nov 19, 2025");
    expect(formatDate(null)).toBe("date not given");
  });
});

describe("hazardStatus", () => {
  // Synthetic values only.
  const base = { kind: "standing-hazard", hazard: "wildfire", dataset: "SYNTHETIC", classification: null, coverage: "verified",
    caveat: "SYNTHETIC", origin: { operator: "x", issuer: null, recordId: "x", recordUrl: "https://example.org", retrievedAt: "2026-01-01T00:00:00Z", issuedAt: null, updatedAt: null } } as const;
  it("describes lookups without ever calling a place safe", () => {
    expect(hazardStatus({ ...base, lookup: "inside", classification: "Very High" } as StandingHazard)).toBe("inside (Very High)");
    expect(hazardStatus({ ...base, lookup: "outside", classification: "NonWildland" } as StandingHazard)).toBe("not in a mapped zone (NonWildland)");
    expect(hazardStatus({ ...base, lookup: "unavailable", coverage: "out-of-bounds" } as StandingHazard)).toBe("not available here");
    expect(hazardStatus({ ...base, hazard: "flood", lookup: "inside", classification: "Zone X (area of minimal flood hazard)" } as StandingHazard))
      .toBe("Zone X (area of minimal flood hazard)");
    for (const lookup of ["inside", "outside", "unavailable"] as const) {
      expect(hazardStatus({ ...base, lookup } as StandingHazard)).not.toMatch(/safe/i);
    }
  });
});

describe("formatTime", () => {
  it("shows publisher times in Los Angeles time with the zone named", () => {
    expect(formatTime("2026-09-26T17:00:00.000Z")).toMatch(/Sep 26, 10:00\s?AM PDT/);
  });

  it("keeps missing or malformed times explicitly unknown", () => {
    expect(formatTime(null)).toBe("time not given");
    expect(formatTime("not a time")).toBe("time not given");
  });
});
