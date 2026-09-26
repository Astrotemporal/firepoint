import { describe, expect, it } from "vitest";
import { createMark } from "@/domain/fire-marks";
import { GLENDALE_CITY_HALL, SHELTERS } from "./data/glendale";
import { MARK_RADIUS_METERS, markHazards } from "./marks";
import { haversine, pickShelter } from "./routing";
import type { GetRoute } from "./types";

/** Straight-line route; duration proportional to distance. Test-only. */
const directRoutes: GetRoute = async (from, to) => ({ path: [from, to], distanceMeters: haversine(from, to), durationSeconds: haversine(from, to) / 10, steps: [] });

describe("fire marks as hazards", () => {
  it("turns each mark into a private, non-simulated fire with a stable id", () => {
    const marks = [createMark(34.15, -118.25), createMark(34.16, -118.24)];
    const [first, second] = markHazards(marks);
    expect(first).toMatchObject({
      id: `mark-${marks[0].id}`, type: "fire", center: { lat: 34.15, lng: -118.25 },
      radiusMeters: MARK_RADIUS_METERS, label: "Fire mark 1", simulated: false, userMark: true,
    });
    expect(second.label).toBe("Fire mark 2");
  });

  it("steers the shelter pick away from a marked fire", async () => {
    const [civic, pacific] = SHELTERS;
    const clear = await pickShelter(GLENDALE_CITY_HALL, SHELTERS, [], directRoutes);
    expect(clear.kind === "route" && clear.shelter.id).toBe(pacific.id);
    const marked = await pickShelter(GLENDALE_CITY_HALL, SHELTERS, markHazards([createMark(pacific.lat, pacific.lng)]), directRoutes);
    expect(marked.kind === "route" && marked.shelter.id).toBe(civic.id);
  });
});
