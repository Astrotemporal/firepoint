import { describe, expect, it } from "vitest";
import { createMark } from "@/domain/fire-marks";
import { getActiveHazards } from "./hazards";
import { markLabel, selectRoutingHazards } from "./marks";
import { SYNTHETIC_HAZARDS } from "../../tests/fixtures/synthetic-fire";

describe("private marks remain visual bookmarks", () => {
  it("uses a stable empty hazard snapshot with no incident source connected", () => {
    expect(getActiveHazards()).toEqual([]);
    expect(getActiveHazards()).toBe(getActiveHazards());
  });

  it("never turns a placed, moved or multiple private marks into a routing hazard", () => {
    const marks = [createMark(34.15, -118.25), createMark(34.16, -118.24)];
    expect(markLabel(0)).toBe("Fire mark 1");
    const noFeed = getActiveHazards();
    expect(selectRoutingHazards({ sourceHazards: noFeed, privateMarks: marks })).toBe(noFeed);
    expect(selectRoutingHazards({ sourceHazards: noFeed, privateMarks: [] })).toBe(noFeed);
    // Even a test-only, explicit hazard list is unchanged by the marks: no 500 m circles are invented.
    expect(selectRoutingHazards({ sourceHazards: SYNTHETIC_HAZARDS, privateMarks: marks }))
      .toBe(SYNTHETIC_HAZARDS);
  });
});
