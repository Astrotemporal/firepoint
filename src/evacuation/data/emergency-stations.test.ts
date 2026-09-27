import { describe, expect, it } from "vitest";
import { haversine } from "../routing";
import { GLENDALE_CITY_HALL, STATION_SHELTERS } from "./glendale";
import data from "./emergency-stations.json";

describe("police and fire stations", () => {
  it("each carries its agency, address, a cited source and a point near Glendale", () => {
    expect(data.stations.length).toBe(31);
    expect(new Set(data.stations.map((station) => station.id)).size).toBe(data.stations.length);
    for (const station of data.stations) {
      expect(["fire-station", "police-station"]).toContain(station.kind);
      expect(station.agency.length, station.id).toBeGreaterThan(0);
      expect(station.address, station.id).toMatch(/, CA 9\d{4}$/);
      expect(station.coordinateSource.length, station.id).toBeGreaterThan(0);
      expect(station.sources.length, station.id).toBeGreaterThan(0);
      for (const source of station.sources) expect(source.url, station.id).toMatch(/^https:\/\//);
      // Everything sits within 15 km of Glendale City Hall.
      expect(haversine(GLENDALE_CITY_HALL, station), station.id).toBeLessThan(15_000);
    }
  });

  it("become shelters with the same unverified, unknown-capacity status as the community centers", () => {
    expect(STATION_SHELTERS).toHaveLength(data.stations.length);
    for (const shelter of STATION_SHELTERS) {
      expect(shelter).toMatchObject({ status: "open", verified: false, capacity: null, currentOccupancy: null, petsAllowed: null, adaCompliant: null });
    }
  });
});
