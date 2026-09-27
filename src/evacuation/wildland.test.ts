import { describe, expect, it } from "vitest";
import { GLENDALE_CITY_HALL, SHELTERS } from "./data/glendale";
import { WILDLAND_SOURCE, WILDLAND_ZONES } from "./data/wildland";
import { createWildlandIndex, type WildlandZone } from "./wildland";

// Synthetic squares, test-only: [longitude, latitude] rings.
const square = (west: number, south: number, size: number): [number, number][] =>
  [[west, south], [west + size, south], [west + size, south + size], [west, south + size]];

describe("wildland index", () => {
  const zones: WildlandZone[] = [
    { severity: "high", rings: [square(0, 0, 10), square(4, 4, 2)] }, // a hole in the middle
    { severity: "very-high", rings: [square(8, 8, 4)] }, // overlaps the high zone's corner
  ];
  const index = createWildlandIndex(zones);

  it("finds the zone at a point, honours holes, and prefers Very High where zones overlap", () => {
    expect(index.severityAt({ lng: 1, lat: 1 })).toBe("high");
    expect(index.severityAt({ lng: 5, lat: 5 })).toBeNull(); // in the hole
    expect(index.severityAt({ lng: 9, lat: 9 })).toBe("very-high");
    expect(index.severityAt({ lng: 11, lat: 11 })).toBe("very-high");
    expect(index.severityAt({ lng: 20, lat: 20 })).toBeNull();
  });
});

describe("Glendale wildland data", () => {
  const index = createWildlandIndex(WILDLAND_ZONES);

  it("is CAL FIRE's 2025 map, and puts the foothills in and downtown out", () => {
    expect(WILDLAND_SOURCE.publisher).toBe("CAL FIRE");
    expect(WILDLAND_SOURCE.mapDate).toBe("2025-03-24");
    expect(index.severityAt(GLENDALE_CITY_HALL)).toBeNull();
    const civic = SHELTERS.find((shelter) => shelter.id === "glendale-civic-auditorium")!;
    const sparr = SHELTERS.find((shelter) => shelter.id === "sparr-heights-community-center")!;
    expect(index.severityAt(civic)).toBe("very-high");
    expect(index.severityAt(sparr)).toBe("high");
  });
});
