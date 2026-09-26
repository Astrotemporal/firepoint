import { describe, expect, it } from "vitest";
import { createMark } from "@/domain/fire-marks";
import { getActiveHazards } from "./hazards";
import { markLabel, privateMarkHalos, PRIVATE_MARK_DISPLAY_RADIUS_METERS, selectRoutingHazards } from "./marks";
import { SYNTHETIC_HAZARDS } from "../../tests/fixtures/synthetic-fire";

describe("private marks remain visual bookmarks", () => {
  it("uses a stable empty hazard snapshot with no incident source connected", () => {
    expect(getActiveHazards()).toEqual([]);
    expect(getActiveHazards()).toBe(getActiveHazards());
  });

  it("keeps each visual halo separate, explicit and free of order or incident semantics", () => {
    const marks = [createMark(34.15, -118.25), createMark(34.15, -118.25)];
    const halos = privateMarkHalos(marks);
    expect(halos).toHaveLength(2); // Overlap is NOT an aggregated fire event or zone.
    expect(halos[0]).toMatchObject({ kind: "private-display-halo", id: marks[0].id,
      center: { lat: 34.15, lng: -118.25 }, displayRadiusMeters: PRIVATE_MARK_DISPLAY_RADIUS_METERS,
      label: "Fire mark 1" });
    expect(PRIVATE_MARK_DISPLAY_RADIUS_METERS).toBe(500);
    for (const halo of halos) {
      for (const field of ["severity", "evacuationStatus", "order", "warning", "verified", "reportCount"]) {
        expect(halo).not.toHaveProperty(field);
      }
    }
  });

  it("never turns a placed, moved or multiple private marks into a routing hazard", () => {
    const marks = [createMark(34.15, -118.25), createMark(34.16, -118.24)];
    expect(markLabel(0)).toBe("Fire mark 1");
    const noFeed = getActiveHazards();
    expect(selectRoutingHazards({ sourceHazards: noFeed, privateMarks: marks })).toBe(noFeed);
    expect(selectRoutingHazards({ sourceHazards: noFeed, privateMarks: [] })).toBe(noFeed);
    // Even a test-only hazard list is unchanged: 500 m display halos never become route buffers.
    expect(selectRoutingHazards({ sourceHazards: SYNTHETIC_HAZARDS, privateMarks: marks }))
      .toBe(SYNTHETIC_HAZARDS);
  });
});
