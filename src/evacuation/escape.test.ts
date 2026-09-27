import { describe, expect, it, vi } from "vitest";
import { SHELTERS } from "./data/glendale";
import { WILDLAND_ZONES } from "./data/wildland";
import {
  awayBearing, candidateMarks, ESCAPE_ROUTE_BATCH, offlineEscape, outsideFireZone, pickEscapeRoute, SAFE_DISTANCE_METERS,
  secondsToSafety, type EscapeContext,
} from "./escape";
import { angularDifference, bearing, haversine, routeIntersectsHazard } from "./routing";
import type { GetRoute, Hazard, LatLng, Route } from "./types";
import { createWildlandIndex, type WildlandIndex } from "./wildland";

// Synthetic geometry, test-only: points are placed by meters north/east of a reference.
const METERS_PER_DEGREE = (Math.PI * 6_371_008.8) / 180;
function offset(from: LatLng, northMeters: number, eastMeters: number): LatLng {
  return {
    lat: from.lat + northMeters / METERS_PER_DEGREE,
    lng: from.lng + eastMeters / (METERS_PER_DEGREE * Math.cos((from.lat * Math.PI) / 180)),
  };
}
function fireAt(center: LatLng, radiusMeters = 500, id = "test-fire"): Hazard {
  return { id, type: "fire", center, radiusMeters, severity: 3, label: "SYNTHETIC TEST FIRE", simulated: true };
}
function route(path: LatLng[], durationSeconds: number, extra: Partial<Route> = {}): Route {
  return { path, durationSeconds, distanceMeters: durationSeconds * 10, steps: [], ...extra };
}

const home: LatLng = { lat: 34.15, lng: -118.25 };
/** 900 m north of home, 500 m radius: home is 400 m from its edge, well inside the fire zone. */
const fire = fireAt(offset(home, 900, 0));
const context: EscapeContext = { hazards: [fire] };
const southish = (to: LatLng, within = 30) => angularDifference(bearing(home, to), 180) < within;
/** A straight road route to wherever it is asked, a minute per 600 m. */
const straight: GetRoute = async (from, to) => route([from, to], haversine(from, to) / 10);

describe("the fire zone", () => {
  it("reaches a mile past the fire's edge", () => {
    expect(outsideFireZone(home, [fire])).toBe(false);
    expect(outsideFireZone(offset(fire.center, -(fire.radiusMeters + SAFE_DISTANCE_METERS + 10), 0), [fire])).toBe(true);
    expect(outsideFireZone(home, [])).toBe(true);
  });

  it("points directly away from a fire, the nearest fire weighing most", () => {
    expect(awayBearing(home, [fire])).toBeCloseTo(180, 0);
    const farEast = fireAt(offset(home, 0, 6000), 500, "far-east");
    expect(angularDifference(awayBearing(home, [fire, farEast]), 180)).toBeLessThan(15);
  });
});

describe("candidate escape marks", () => {
  const marks = candidateMarks(home, context);

  it("sit just outside the fire zone, the nearest straight away from the fire", () => {
    expect(marks.length).toBeGreaterThan(5);
    for (const mark of marks) {
      expect(mark.fireMeters).toBeGreaterThanOrEqual(SAFE_DISTANCE_METERS);
      expect(mark.fireMeters).toBeLessThan(SAFE_DISTANCE_METERS + 500); // just outside, not a far-off destination
    }
    expect(southish(marks[0], 1)).toBe(true); // of the equally near ones, the one straight away from the fire
    expect(marks[0].meters).toBeCloseTo(1600, -2); // the zone's edge (~1.2 km) plus the 300 m margin, to the 100 m step
  });

  it("are never on the far side of the fire, or reached by passing it", () => {
    for (const mark of marks) {
      expect(angularDifference(bearing(home, mark), 0)).toBeGreaterThan(45);
      expect(routeIntersectsHazard([home, mark], [fire], { origin: home })).toBe(false);
    }
  });

  /** Hills in a band from `from` to `to` meters south of home. */
  const hillsSouth = (from: number, to: number): WildlandIndex => ({
    severityAt: (point) => (point.lat < offset(home, -from, 0).lat && point.lat > offset(home, -to, 0).lat ? "very-high" : null),
  });

  it("slide off the hills onto flat ground within a kilometer", () => {
    const hills = hillsSouth(1400, 1750);
    const [south] = candidateMarks(home, { hazards: [fire], wildland: hills }).filter((mark) => southish(mark, 5));
    expect(hills.severityAt(south)).toBeNull();
    expect(south.meters).toBeCloseTo(1800, -2);
  });

  it("stay just outside the fire zone when the hills go on: the trip is never stretched for them", () => {
    const [south] = candidateMarks(home, { hazards: [fire], wildland: hillsSouth(1400, 6000) }).filter((mark) => southish(mark, 5));
    expect(south.meters).toBeCloseTo(1600, -2);
  });
});

describe("secondsToSafety", () => {
  it("is the driving time until the route leaves the fire zone for good", () => {
    const south = route([home, offset(home, -3000, 0)], 300);
    // The zone's edge is ~1,209 m south of home; time splits by distance along the route.
    expect(secondsToSafety(south, [fire])).toBeCloseTo(121, -1);
    expect(secondsToSafety(route([offset(home, -2000, 0), offset(home, -3000, 0)], 100), [fire])).toBe(0);
  });
});

describe("pickEscapeRoute", () => {
  it("has nothing to do without a fire, and says so when the start is already outside the fire zone", async () => {
    expect(await pickEscapeRoute(home, { hazards: [] }, straight)).toEqual({ kind: "no-fire" });
    const far = offset(home, -4000, 0);
    expect(await pickEscapeRoute(far, context, straight)).toMatchObject({ kind: "already-safe", threat: { hazard: fire } });
  });

  it("takes the road that gets out of the fire zone fastest, not the nearest mark", async () => {
    // Straight south is the shortest way out, but that road is slow (say, jammed); the others move.
    const getRoute: GetRoute = async (from, to) => route([from, to], southish(to, 10) ? 900 : 400);
    const pick = await pickEscapeRoute(home, context, getRoute);
    expect(pick.kind).toBe("route");
    if (pick.kind !== "route") return;
    expect(southish(pick.mark, 10)).toBe(false);
    expect(pick.route.durationSeconds).toBe(400);
    expect(pick.secondsToSafety).toBeGreaterThan(0);
    expect(pick.secondsToSafety).toBeLessThan(400);
  });

  it("ends at the road point the route actually reaches, which becomes the escape mark", async () => {
    const snapped = (to: LatLng) => offset(to, 0, 80);
    const pick = await pickEscapeRoute(home, context, async (from, to) => route([from, snapped(to)], 200));
    expect(pick.kind).toBe("route");
    if (pick.kind !== "route") return;
    expect(pick.mark).toMatchObject(pick.route.path.at(-1)!);
    expect(outsideFireZone(pick.mark, [fire])).toBe(true);
  });

  it("uses a provider alternative when the main route passes the fire", async () => {
    const getRoute: GetRoute = async (from, to) => ({
      ...route([from, fire.center, to], 60), // contrived shortcut through the fire
      alternatives: [route([from, to], 500)],
    });
    const pick = await pickEscapeRoute(home, context, getRoute);
    expect(pick).toMatchObject({ kind: "route", route: { durationSeconds: 500 } });
  });

  it("avoids ending on a freeway, where nobody can stop", async () => {
    const getRoute: GetRoute = async (from, to) => (southish(to, 10)
      ? route([from, to], 300, { arrivesOnMotorway: true })
      : route([from, to], 500));
    const pick = await pickEscapeRoute(home, context, getRoute);
    expect(pick.kind === "route" && pick.route.arrivesOnMotorway).toBeFalsy();
  });

  it("offers no route whose road end is still in the fire zone, and points away from the fire instead", async () => {
    const pick = await pickEscapeRoute(home, context, async (from) => route([from, offset(home, -600, 0)], 100));
    expect(pick.kind).toBe("no-safe-route");
    if (pick.kind !== "no-safe-route") return;
    expect(pick.bearing).toBeCloseTo(180, 0);
  });

  it("routes five directions at once, and the rest only when none of them works", async () => {
    const works = vi.fn(straight);
    expect((await pickEscapeRoute(home, context, works)).kind).toBe("route");
    expect(works).toHaveBeenCalledTimes(ESCAPE_ROUTE_BATCH);
    const directions = works.mock.calls.map(([, to]) => bearing(home, to));
    for (const [index, a] of directions.entries()) {
      for (const b of directions.slice(index + 1)) expect(angularDifference(a, b)).toBeGreaterThan(44.5);
    }

    const fails = vi.fn<GetRoute>(async () => { throw new Error("provider down"); });
    const pick = await pickEscapeRoute(home, context, fails);
    expect(candidateMarks(home, context).length).toBeGreaterThan(ESCAPE_ROUTE_BATCH * 2);
    expect(fails).toHaveBeenCalledTimes(ESCAPE_ROUTE_BATCH * 2); // two rounds, then it stops
    expect(pick).toMatchObject({ kind: "routing-unavailable", reason: "provider-error", mark: candidateMarks(home, context)[0] });
  });

  it("finds no way out when fires hem in every direction", async () => {
    const ring = Array.from({ length: 8 }, (_, index) => fireAt(offset(home, 1500 * Math.cos(index * Math.PI / 4), 1500 * Math.sin(index * Math.PI / 4)), 700, `ring-${index}`));
    const getRoute = vi.fn(straight);
    expect(candidateMarks(home, { hazards: ring })).toEqual([]);
    expect((await pickEscapeRoute(home, { hazards: ring }, getRoute)).kind).toBe("no-safe-route");
    expect(getRoute).not.toHaveBeenCalled();
  });

  it("stops at once when the trip is cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(pickEscapeRoute(home, context, straight, { signal: controller.signal })).rejects.toThrow();
  });
});

describe("offlineEscape", () => {
  it("names the nearest escape mark without calling the provider", () => {
    expect(offlineEscape(home, context)).toMatchObject({ kind: "routing-unavailable", reason: "offline", mark: candidateMarks(home, context)[0] });
    expect(offlineEscape(home, { hazards: [] })).toEqual({ kind: "no-fire" });
    expect(offlineEscape(offset(home, -4000, 0), context).kind).toBe("already-safe");
  });
});

describe("Glendale", () => {
  const wildland = createWildlandIndex(WILDLAND_ZONES);

  it("escapes the Civic Auditorium from a fire in the Verdugos above it, to marks outside the fire zone", () => {
    const civic = SHELTERS.find((shelter) => shelter.id === "glendale-civic-auditorium")!;
    const verdugoFire = fireAt(offset(civic, 1200, 400));
    const marks = candidateMarks(civic, { hazards: [verdugoFire], wildland });
    expect(marks.length).toBeGreaterThan(0);
    for (const mark of marks) expect(outsideFireZone(mark, [verdugoFire])).toBe(true);
    // The nearest way out leads away from the fire, down toward the flats.
    expect(angularDifference(bearing(civic, marks[0]), bearing(verdugoFire.center, civic))).toBeLessThan(60);
  });
});
