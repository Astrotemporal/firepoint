import { describe, expect, it, vi } from "vitest";
import { COMMUNITY_SHELTERS, GLENDALE_CITY_HALL, SHELTERS, STATION_SHELTERS } from "./data/glendale";
import { SYNTHETIC_HAZARDS } from "../../tests/fixtures/synthetic-fire";
import {
  angularDifference, bearing, destinationPoint, haversine, pickShelter, pointInHazard, rankShelters, routeIntersectsHazard,
} from "./routing";
import type { GetRoute, Hazard, LatLng, Route, Shelter } from "./types";

// Synthetic geometry, test-only: points are placed by meters north/east of a reference.
const METERS_PER_DEGREE = (Math.PI * 6_371_008.8) / 180;
function offset(from: LatLng, northMeters: number, eastMeters: number): LatLng {
  return {
    lat: from.lat + northMeters / METERS_PER_DEGREE,
    lng: from.lng + eastMeters / (METERS_PER_DEGREE * Math.cos((from.lat * Math.PI) / 180)),
  };
}

const home: LatLng = { lat: 34.15, lng: -118.25 };
const fire: Hazard = {
  id: "test-fire", type: "fire", center: offset(home, 5000, 0), radiusMeters: 1500,
  severity: 4, label: "SYNTHETIC TEST FIRE", simulated: true,
};

function shelter(id: string, point: LatLng, overrides: Partial<Shelter> = {}): Shelter {
  return {
    id, name: id, address: "Synthetic address", ...point, capacity: null, currentOccupancy: null,
    petsAllowed: null, adaCompliant: null, status: "open", verified: false, ...overrides,
  };
}
function route(path: LatLng[], durationSeconds: number): Route {
  return { path, durationSeconds, distanceMeters: durationSeconds * 10, steps: [] };
}
/** Straight-line route; duration proportional to distance. */
const directRoutes: GetRoute = async (from, to) => route([from, to], haversine(from, to) / 10);

describe("geometry", () => {
  it("measures distance and bearing", () => {
    expect(haversine(home, offset(home, 1000, 0))).toBeCloseTo(1000, 0);
    expect(bearing(home, offset(home, 1000, 0))).toBeCloseTo(0, 1);
    expect(bearing(home, offset(home, 0, 1000))).toBeCloseTo(90, 1);
    expect(bearing(home, offset(home, -1000, 0))).toBeCloseTo(180, 1);
    expect(bearing(home, offset(home, 0, -1000))).toBeCloseTo(270, 1);
    expect(angularDifference(350, 10)).toBe(20);
    expect(angularDifference(0, 180)).toBe(180);
    const east = destinationPoint(home, 90, 1000);
    expect(haversine(home, east)).toBeCloseTo(1000, 0);
    expect(bearing(home, east)).toBeCloseTo(90, 1);
  });

  it("checks a point against a hazard radius plus buffer", () => {
    expect(pointInHazard(fire.center, fire)).toBe(true);
    const nearby = offset(fire.center, -1600, 0);
    expect(pointInHazard(nearby, fire)).toBe(false);
    expect(pointInHazard(nearby, fire, 500)).toBe(true);
  });
});

describe("routeIntersectsHazard", () => {
  it("rejects a route through a hazard even when no vertex is inside it", () => {
    const path = [offset(fire.center, 0, -4000), offset(fire.center, 0, 4000)];
    expect(routeIntersectsHazard(path, [fire])).toBe(true);
  });

  it("uses radius + 500 m as the clearance", () => {
    const pass = (northOfCenter: number) => [offset(fire.center, northOfCenter, -4000), offset(fire.center, northOfCenter, 4000)];
    expect(routeIntersectsHazard(pass(-1800), [fire])).toBe(true);
    expect(routeIntersectsHazard(pass(-2200), [fire])).toBe(false);
    expect(routeIntersectsHazard(pass(-2200), [])).toBe(false);
  });

  it("starting inside the buffer, allows leaving but not heading deeper", () => {
    const start = offset(fire.center, -1700, 0);
    expect(routeIntersectsHazard([start, offset(fire.center, -6000, 0)], [fire])).toBe(false);
    expect(routeIntersectsHazard([start, offset(fire.center, -1000, 0)], [fire])).toBe(true);
  });
});

describe("pickShelter", () => {
  it("excludes a shelter inside a hazard buffer even when it is the closest", async () => {
    const nearFire = shelter("near-fire", offset(fire.center, -2000, 0)); // 3 km from home, 2 km from the fire
    const clear = shelter("clear", offset(home, -4000, 0));
    const getRoute = vi.fn(directRoutes);
    const result = await pickShelter(home, [nearFire, clear], [fire], getRoute);
    expect(result).toMatchObject({ kind: "route", shelter: { id: "clear" } });
    expect(getRoute.mock.calls.map(([, to]) => (to as Shelter).id)).toEqual(["clear"]);
  });

  it("rejects a route that passes through a hazard and takes the next candidate", async () => {
    const north = shelter("beyond-fire", offset(fire.center, 3000, 0));
    const west = shelter("west", offset(home, 0, -3500));
    const getRoute: GetRoute = async (from, to) => to === north
      ? route([from, fire.center, to], 300) // fastest, but straight through the fire
      : route([from, to], 900);
    expect(await pickShelter(home, [north, west], [fire], getRoute)).toMatchObject({ kind: "route", shelter: { id: "west" } });
  });

  it("uses a provider alternative that avoids the hazard when the main route crosses it", async () => {
    const north = shelter("beyond-fire", offset(fire.center, 3000, 0));
    const detour = route([home, offset(home, 0, 4000), offset(fire.center, 0, 4000), north], 1200);
    const getRoute: GetRoute = async (from, to) => ({ ...route([from, fire.center, to], 300), alternatives: [detour] });
    expect(await pickShelter(home, [north], [fire], getRoute)).toMatchObject({ kind: "route", route: { durationSeconds: 1200 } });
  });

  it("picks the fastest clear route among the top three, not the nearest", async () => {
    const nearest = shelter("nearest", offset(home, -1000, 0));
    const faster = shelter("faster", offset(home, 0, 2000));
    const getRoute: GetRoute = async (from, to) => route([from, to], to === faster ? 120 : 600);
    expect(await pickShelter(home, [nearest, faster], [], getRoute)).toMatchObject({ kind: "route", shelter: { id: "faster" } });
  });

  it("tries later candidates when all of the top three are rejected", async () => {
    const crossing = [1, 2, 3].map((n) => shelter(`crossing-${n}`, offset(home, -1000 * n, 0)));
    const fourth = shelter("fourth", offset(home, -6000, 0));
    const getRoute = vi.fn<GetRoute>(async (from, to) =>
      to === fourth ? route([from, to], 900) : route([from, fire.center, to], 60));
    expect(await pickShelter(home, [...crossing, fourth], [fire], getRoute)).toMatchObject({ kind: "route", shelter: { id: "fourth" } });
    expect(getRoute).toHaveBeenCalledTimes(4);
  });

  it("says there is no safe route when every route crosses a hazard", async () => {
    const getRoute: GetRoute = async (from, to) => route([from, fire.center, to], 60);
    const result = await pickShelter(home, [shelter("a", offset(home, -1000, 0))], [fire], getRoute);
    expect(result).toMatchObject({ kind: "no-safe-route", nearest: { id: "a" } });
  });

  it("falls back to straight-line guidance when routing fails", async () => {
    const getRoute: GetRoute = async () => { throw new Error("offline"); };
    const result = await pickShelter(home, [shelter("a", offset(home, -1000, 0))], [fire], getRoute);
    expect(result).toMatchObject({ kind: "routing-unavailable", shelter: { id: "a" }, reason: "provider-error" });
  });

  it("skips closed and full shelters", async () => {
    const shelters = [
      shelter("closed", offset(home, -500, 0), { status: "closed" }),
      shelter("full", offset(home, -600, 0), { capacity: 100, currentOccupancy: 100 }),
    ];
    expect(await pickShelter(home, shelters, [], directRoutes)).toEqual({ kind: "no-shelter" });
  });
});

describe("Glendale stub data", () => {
  it("excludes the two foothill shelters near the simulated Verdugo fire, nearest first", () => {
    const ids = rankShelters(GLENDALE_CITY_HALL, COMMUNITY_SHELTERS, SYNTHETIC_HAZARDS).map(({ shelter: s }) => s.id);
    expect(ids).toEqual(["glendale-adult-recreation-center", "pacific-community-center"]);
    expect(rankShelters(GLENDALE_CITY_HALL, COMMUNITY_SHELTERS, [])).toHaveLength(4);
  });

  it("routes to police and fire stations like the community shelters, skipping those near the fire", () => {
    expect(SHELTERS).toHaveLength(COMMUNITY_SHELTERS.length + STATION_SHELTERS.length);
    expect(rankShelters(GLENDALE_CITY_HALL, SHELTERS, [])).toHaveLength(SHELTERS.length);
    const ranked = rankShelters(GLENDALE_CITY_HALL, SHELTERS, SYNTHETIC_HAZARDS);
    expect(ranked[0].shelter.id).toBe("glendale-police-hq"); // a block from City Hall
    const ids = ranked.map(({ shelter: s }) => s.id);
    expect(ids).not.toContain("glendale-fire-station-24"); // 1734 Canada Blvd, in the fire's 1 km buffer
    expect(ids).not.toContain("glendale-civic-auditorium");
  });
});
