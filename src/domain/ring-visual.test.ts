import { describe, expect, it } from "vitest";
import { createMark } from "@/domain/fire-marks";
import {
  DEFENSIBLE_SPACE_BANDS, RING_DASH, ringDescription, ringLabel, ringRadius, ringStack,
  type DefensibleSpaceBand, type PrivateDisplayHalo, type RingVisual,
} from "@/domain/ring-visual";
import { SOURCES, ZONES } from "@/domain/wildfire-guide";
import { privateMarkHalos, PRIVATE_MARK_DISPLAY_RADIUS_METERS } from "@/evacuation/marks";

// Synthetic only: a fixed test coordinate, never a stored mark, report or live position.
const SYNTHETIC_MARKS = [createMark(34.15, -118.25), createMark(34.16, -118.24)];

describe("ring visual contract: one drawing convention, two unrelated meanings", () => {
  it("derives the defensible-space bands from the cited guide zones, in feet, with the RSG citation", () => {
    expect(DEFENSIBLE_SPACE_BANDS.map((band) => [band.band, band.innerFeet, band.outerFeet])).toEqual([[1, 0, 30], [2, 30, 100], [3, 100, 200]]);
    for (const band of DEFENSIBLE_SPACE_BANDS) {
      expect(band).toMatchObject({ kind: "defensible-space-band", meaning: "house-prep-guidance", unit: "ft", citation: SOURCES.rsg });
      expect(band.citation.url).toBe("https://fire.lacounty.gov/rsg/");
      for (const field of ["center", "provenance", "displayRadiusMeters", "id"]) expect(band).not.toHaveProperty(field);
    }
    expect(DEFENSIBLE_SPACE_BANDS.map((band) => band.outerFeet)).toEqual(ZONES.map((zone) => zone.feet));
  });

  it("keeps a private halo in metres, on this device, as an arbitrary sketch with no citation or risk field", () => {
    const halos = privateMarkHalos(SYNTHETIC_MARKS);
    expect(halos).toHaveLength(2);
    for (const halo of halos) {
      expect(halo).toMatchObject({ kind: "private-display-halo", meaning: "arbitrary-display-sketch", unit: "m",
        provenance: "this-device", displayRadiusMeters: PRIVATE_MARK_DISPLAY_RADIUS_METERS });
      for (const field of ["citation", "innerFeet", "outerFeet", "band", "severity", "order", "warning", "perimeter",
        "reportCount", "verified", "risk", "evacuationStatus"]) expect(halo).not.toHaveProperty(field);
    }
  });

  it("never lets a radius, label or description cross units or meanings", () => {
    const [band] = DEFENSIBLE_SPACE_BANDS as [DefensibleSpaceBand, ...DefensibleSpaceBand[]];
    const [halo] = privateMarkHalos(SYNTHETIC_MARKS) as [PrivateDisplayHalo, ...PrivateDisplayHalo[]];
    expect(ringRadius(band)).toBe(30);
    expect(ringRadius(halo)).toBe(500);
    expect(ringLabel(band)).toBe("30 ft");
    expect(ringLabel(halo)).toBe("500 m · private sketch");
    expect(ringLabel(halo)).not.toMatch(/ft|zone|order|warning|perimeter/i);
    expect(ringDescription(band)).toBe("Zone 1 is 0 to 30 feet from the house.");
    expect(ringDescription(halo)).toBe("Fire mark 1: a private 500 m display sketch on this device, not a fire perimeter, evacuation zone or report.");
    // No feet↔metres conversion exists in the contract: 500 m is not "1640 ft" and 200 ft is not "61 m".
    expect(JSON.stringify([ringLabel(band), ringLabel(halo), ringDescription(band), ringDescription(halo)])).not.toMatch(/1640|61 m/);
  });

  it("shares only the dash rhythm and stacking order; the outer band and every halo are dashed", () => {
    expect(RING_DASH).toEqual([3, 4]);
    const bands = ringStack(DEFENSIBLE_SPACE_BANDS);
    expect(bands.map((edge) => [edge.ring.band, edge.radius, edge.dashed, edge.label]))
      .toEqual([[3, 200, true, "200 ft"], [2, 100, false, "100 ft"], [1, 30, false, "30 ft"]]);
    const halos = ringStack(privateMarkHalos(SYNTHETIC_MARKS));
    expect(halos).toHaveLength(2); // Two separate sketches, not one concentric or aggregated area.
    for (const edge of halos) expect(edge).toMatchObject({ radius: 500, dashed: true, label: "500 m · private sketch" });
    expect(halos.map((edge) => edge.ring.id)).toEqual(expect.arrayContaining(SYNTHETIC_MARKS.map((mark) => mark.id)));
  });

  it("refuses to draw defensible-space bands and private halos as one picture", () => {
    const mixed: RingVisual[] = [...DEFENSIBLE_SPACE_BANDS, ...privateMarkHalos(SYNTHETIC_MARKS)];
    // @ts-expect-error mixed sets are rejected at compile time by the overloads…
    expect(() => ringStack(mixed)).toThrow(/never one picture/);
    expect(ringStack([])).toEqual([]);
  });
});
