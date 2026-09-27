import { describe, expect, it } from "vitest";
import { createMark } from "@/domain/fire-marks";
import { COMMUNITY_SHELTERS as SHELTERS, GLENDALE_CITY_HALL } from "./data/glendale";
import { getActiveHazards } from "./hazards";
import {
  MARK_RADIUS_METERS, markHazards, markLabel, privateMarkHalos, PRIVATE_MARK_DISPLAY_RADIUS_METERS, selectRoutingHazards,
} from "./marks";
import { haversine, pickShelter } from "./routing";
import type { GetRoute } from "./types";
import { SYNTHETIC_HAZARDS } from "../../tests/fixtures/synthetic-fire";

/** Straight-line routes; duration proportional to distance. Test-only. */
const directRoutes: GetRoute = async (from, to) => ({ path: [from, to], distanceMeters: haversine(from, to), durationSeconds: haversine(from, to) / 10, steps: [] });

describe("private fire marks", () => {
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

  it("counts each mark as a fire the directions steer around, never a report", () => {
    const marks = [createMark(34.15, -118.25), createMark(34.16, -118.24)];
    expect(markLabel(0)).toBe("Fire mark 1");
    const noFeed = getActiveHazards();
    expect(selectRoutingHazards({ sourceHazards: noFeed, privateMarks: [] })).toBe(noFeed);
    const hazards = selectRoutingHazards({ sourceHazards: SYNTHETIC_HAZARDS, privateMarks: marks });
    expect(hazards.slice(0, SYNTHETIC_HAZARDS.length)).toEqual(SYNTHETIC_HAZARDS);
    expect(hazards.slice(SYNTHETIC_HAZARDS.length)).toEqual(markHazards(marks));
    expect(markHazards(marks)[0]).toMatchObject({
      id: `mark-${marks[0].id}`, type: "fire", center: { lat: 34.15, lng: -118.25 },
      radiusMeters: MARK_RADIUS_METERS, label: "Fire mark 1", simulated: false, userMark: true,
    });
  });

  it("steers the shelter pick away from a marked fire", async () => {
    const civic = SHELTERS.find((shelter) => shelter.id === "glendale-civic-auditorium")!;
    const nearest = SHELTERS.find((shelter) => shelter.id === "glendale-adult-recreation-center")!;
    const clear = await pickShelter(GLENDALE_CITY_HALL, SHELTERS, [], directRoutes);
    expect(clear.kind === "route" && clear.shelter.id).toBe(nearest.id);
    // A mark on the nearest shelter also rules out Pacific, 1.1 km away; the Civic Auditorium is next.
    const marked = await pickShelter(GLENDALE_CITY_HALL, SHELTERS, markHazards([createMark(nearest.lat, nearest.lng)]), directRoutes);
    expect(marked.kind === "route" && marked.shelter.id).toBe(civic.id);
  });
});
