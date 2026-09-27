import { describe, expect, it, vi } from "vitest";
import { Navigator, REROUTE_INTERVAL_MS, routeProgress, type NavTarget } from "./navigation";
import { destinationPoint, haversine } from "./routing";
import type { GetRoute, Hazard, LatLng, Route } from "./types";

// Synthetic geometry only: a 1 km road due east, then 500 m due north.
const start: LatLng = { lat: 34.15, lng: -118.25 };
const corner = destinationPoint(start, 90, 1_000);
const end = destinationPoint(corner, 0, 500);
const road: Route = {
  path: [start, destinationPoint(start, 90, 500), corner, end],
  distanceMeters: 1_500,
  durationSeconds: 300,
  steps: [
    { instruction: "SYNTHETIC depart east", distanceMeters: 1_000, durationSeconds: 200, turn: "depart" },
    { instruction: "SYNTHETIC turn left", distanceMeters: 500, durationSeconds: 100, turn: "left" },
    { instruction: "SYNTHETIC arrive", distanceMeters: 0, durationSeconds: 0, turn: "arrive" },
  ],
};
const target: NavTarget = { kind: "shelter", name: "SYNTHETIC SHELTER", destination: end };
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("routeProgress", () => {
  it("snaps to the route and reports the next turn, distance and time left", () => {
    const progress = routeProgress(road, destinationPoint(start, 90, 300));
    expect(progress.offRouteMeters).toBeLessThan(1);
    expect(progress.alongMeters).toBeCloseTo(300, -1);
    expect(progress.remainingMeters).toBeCloseTo(1_200, -1);
    expect(progress.remainingSeconds).toBeCloseTo(240, -1);
    expect(progress.next?.step.instruction).toBe("SYNTHETIC turn left");
    expect(progress.next?.distanceMeters).toBeCloseTo(700, -1);
    expect(progress.headingDegrees).toBeCloseTo(90, 0);
  });

  it("moves to the following maneuver once a turn is passed, and measures distance off the line", () => {
    const afterTurn = routeProgress(road, destinationPoint(corner, 0, 100));
    expect(afterTurn.next?.step.instruction).toBe("SYNTHETIC arrive");
    // Due north: 0° and 360° are the same heading.
    expect(Math.min(afterTurn.headingDegrees, 360 - afterTurn.headingDegrees)).toBeLessThan(0.5);
    const beside = routeProgress(road, destinationPoint(destinationPoint(start, 90, 300), 0, 80));
    expect(beside.offRouteMeters).toBeCloseTo(80, -1);
  });
});

describe("Navigator", () => {
  function setup(getRoute: GetRoute = vi.fn(async () => road)) {
    let clock = 0;
    const navigator = new Navigator({ getRoute, now: () => clock });
    return { navigator, getRoute, advance: (ms: number) => { clock += ms; } };
  }

  it("waits for GPS, then follows the planned route without asking for a new one", async () => {
    const { navigator, getRoute } = setup();
    navigator.start(target, road);
    expect(navigator.getSnapshot().status).toBe("waiting-for-gps");
    navigator.update(destinationPoint(start, 90, 100), 10, []);
    await flush();
    const state = navigator.getSnapshot();
    expect(state.status).toBe("navigating");
    expect(state.progress?.next?.step.instruction).toBe("SYNTHETIC turn left");
    expect(getRoute).not.toHaveBeenCalled();
  });

  it("reroutes at once when the first fix is far from a route planned from a fallback start", async () => {
    const { navigator, getRoute } = setup();
    navigator.start(target, road);
    const here = destinationPoint(start, 180, 400);
    navigator.update(here, 10, []);
    expect(navigator.getSnapshot().status).toBe("rerouting");
    await flush();
    expect(getRoute).toHaveBeenCalledWith(here, end, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(navigator.getSnapshot().status).toBe("navigating");
  });

  it("ignores a single stray fix, reroutes after two, and rate-limits further requests", async () => {
    const { navigator, getRoute, advance } = setup();
    navigator.start(target, road);
    navigator.update(destinationPoint(start, 90, 100), 10, []);
    const astray = destinationPoint(destinationPoint(start, 90, 300), 0, 120);
    navigator.update(astray, 10, []);
    expect(getRoute).not.toHaveBeenCalled();
    navigator.update(astray, 10, []);
    await flush();
    expect(getRoute).toHaveBeenCalledTimes(1);
    navigator.update(astray, 10, []);
    navigator.update(astray, 10, []);
    await flush();
    expect(getRoute).toHaveBeenCalledTimes(1);
    advance(REROUTE_INTERVAL_MS);
    navigator.update(astray, 10, []);
    await flush();
    expect(getRoute).toHaveBeenCalledTimes(2);
  });

  it("widens the off-route tolerance for poor GPS accuracy", async () => {
    const { navigator, getRoute } = setup();
    navigator.start(target, road);
    const nearby = destinationPoint(destinationPoint(start, 90, 300), 0, 90);
    navigator.update(nearby, 150, []);
    navigator.update(nearby, 150, []);
    await flush();
    expect(getRoute).not.toHaveBeenCalled();
  });

  it("prefers a returned alternative that avoids hazards, and flags when none does", async () => {
    const hazard: Hazard = {
      id: "h", type: "fire", center: destinationPoint(start, 90, 500), radiusMeters: 200, severity: 3, label: "SYNTHETIC", simulated: true,
    };
    const detour: Route = { ...road, path: [start, destinationPoint(start, 0, 800), destinationPoint(corner, 0, 800), end], durationSeconds: 400 };
    const { navigator } = setup(vi.fn(async () => ({ ...road, alternatives: [detour] })));
    navigator.start(target, null);
    navigator.update(start, 10, [hazard]);
    await flush();
    expect(navigator.getSnapshot().route).toBe(detour);
    expect(navigator.getSnapshot().nearHazard).toBe(false);

    const blocked = setup(vi.fn(async () => road)).navigator;
    blocked.start(target, null);
    blocked.update(start, 10, [hazard]);
    await flush();
    expect(blocked.getSnapshot().route).toBe(road);
    expect(blocked.getSnapshot().nearHazard).toBe(true);
  });

  it("keeps straight-line guidance when directions fail, and reports it", async () => {
    const { navigator } = setup(vi.fn(async () => { throw new Error("offline"); }));
    navigator.start(target, null);
    navigator.update(start, 10, []);
    await flush();
    const state = navigator.getSnapshot();
    expect(state.route).toBeNull();
    expect(state.rerouteFailed).toBe(true);
    expect(state.straight?.meters).toBeCloseTo(haversine(start, end), -1);
  });

  it("stops at the destination and clears everything on stop", async () => {
    const { navigator, getRoute } = setup();
    navigator.start(target, road);
    navigator.update(destinationPoint(end, 180, 20), 10, []);
    expect(navigator.getSnapshot().status).toBe("arrived");
    navigator.update(start, 10, []);
    expect(navigator.getSnapshot().status).toBe("arrived");
    expect(getRoute).not.toHaveBeenCalled();
    navigator.stop();
    expect(navigator.getSnapshot().target).toBeNull();
    expect(navigator.active).toBe(false);
  });
});
