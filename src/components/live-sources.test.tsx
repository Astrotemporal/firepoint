import { describe, expect, it } from "vitest";
import { formatTime } from "./live-sources";

describe("formatTime", () => {
  it("shows publisher times in Los Angeles time with the zone named", () => {
    expect(formatTime("2026-09-26T17:00:00.000Z")).toMatch(/Sep 26, 10:00\s?AM PDT/);
  });

  it("keeps missing or malformed times explicitly unknown", () => {
    expect(formatTime(null)).toBe("time not given");
    expect(formatTime("not a time")).toBe("time not given");
  });
});
