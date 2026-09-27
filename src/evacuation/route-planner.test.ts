import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SHELTERS } from "./data/glendale";
import { SYNTHETIC_HAZARDS } from "../../tests/fixtures/synthetic-fire";
import { RoutePlanner } from "./route-planner";
import type { GetRoute, Hazard, LatLng, Shelter } from "./types";

const cityHall: LatLng = { lat: 34.14662, lng: -118.24825 };
/** ~`meters` north of City Hall. */
const north = (meters: number): LatLng => ({ lat: cityHall.lat + meters / 111_195, lng: cityHall.lng });
/** Synthetic fire 1 km north of City Hall: City Hall is inside its danger zone, so there is something to escape. */
const NEAR_FIRE: Hazard = {
  id: "test-near-fire", type: "fire", center: north(1000), radiusMeters: 500, severity: 3, label: "TEST FIRE", simulated: true,
};

describe("RoutePlanner recalculation", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  function setup(online = true) {
    const getRoute = vi.fn<GetRoute>(async (from, to) => ({
      path: [from, to], distanceMeters: 1000, durationSeconds: 120, steps: [],
    }));
    const planner = new RoutePlanner({
      getRoute, shelters: SHELTERS, isOnline: () => online,
      debounceMs: 1000, minIntervalMs: 5000, now: () => Date.now(),
    });
    return { planner, getRoute, runs: () => new Set(getRoute.mock.calls.map(([from]) => `${from.lat},${from.lng}`)).size };
  }

  it("coalesces GPS ticks and ignores movement under 150 m", async () => {
    const { planner, getRoute, runs } = setup();
    for (const meters of [0, 20, 40, 60]) planner.update(north(meters), []);
    expect(planner.getSnapshot().pending).toBe(true);
    expect(getRoute).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(runs()).toBe(1);
    expect(getRoute.mock.calls[0][0]).toEqual(north(60)); // latest position at run time

    for (const meters of [100, 140, 180]) planner.update(north(meters), []); // ≤150 m from the run at 60 m
    await vi.advanceTimersByTimeAsync(10_000);
    expect(runs()).toBe(1);
    expect(planner.getSnapshot().plan?.origin).toEqual(north(60));
  });

  it("recalculates after moving more than 150 m, no sooner than the minimum interval", async () => {
    const { planner, runs } = setup();
    planner.update(north(0), []);
    await vi.advanceTimersByTimeAsync(1000); // first run starts at t=1 s
    planner.update(north(200), []);
    await vi.advanceTimersByTimeAsync(4000);
    expect(runs()).toBe(1);
    await vi.advanceTimersByTimeAsync(1000); // t=6 s: 5 s after the previous run started
    expect(runs()).toBe(2);
    expect(planner.getSnapshot().plan?.origin).toEqual(north(200));
  });

  it("recalculates when the hazard list changes, even without movement", async () => {
    const { planner, runs } = setup();
    planner.update(north(0), []);
    await vi.advanceTimersByTimeAsync(1000);
    expect(planner.getSnapshot().plan?.shelter.kind).toBe("route");
    planner.update(north(0), SYNTHETIC_HAZARDS);
    await vi.advanceTimersByTimeAsync(1000);
    expect(runs()).toBe(1); // same origin
    expect(planner.getSnapshot().plan?.hazardsKey).toContain("SYNTHETIC-TEST-FIRE");
  });

  it("offline, gives straight-line shelter targets without calling the routing API, and no escape unless requested", async () => {
    const { planner, getRoute } = setup(false);
    planner.update(cityHall, SYNTHETIC_HAZARDS);
    await vi.advanceTimersByTimeAsync(1000);
    const plan = planner.getSnapshot().plan;
    expect(getRoute).not.toHaveBeenCalled();
    // Glendale Police headquarters, a block from City Hall, is the nearest place the shelter route can lead.
    expect(plan?.shelter).toMatchObject({ kind: "routing-unavailable", reason: "offline", shelter: { id: "glendale-police-hq" } });
    expect(plan?.escape).toEqual({ kind: "not-requested" });

    planner.requestEscape();
    await vi.advanceTimersByTimeAsync(1000);
    expect(getRoute).not.toHaveBeenCalled();
    // The simulated Verdugo fire is ~3 km beyond City Hall's reach: already outside its danger zone.
    expect(planner.getSnapshot().plan?.escape).toMatchObject({ kind: "already-safe" });

    planner.update(cityHall, [NEAR_FIRE]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(getRoute).not.toHaveBeenCalled();
    expect(planner.getSnapshot().plan?.escape).toMatchObject({ kind: "routing-unavailable", reason: "offline" });
  });
});

describe("RoutePlanner escape requests", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  function setup() {
    const getRoute = vi.fn<GetRoute>(async (from, to) => ({
      path: [from, to], distanceMeters: 1000, durationSeconds: 120, steps: [],
    }));
    const planner = new RoutePlanner({
      getRoute, shelters: SHELTERS, isOnline: () => true,
      debounceMs: 1000, minIntervalMs: 5000, now: () => Date.now(),
    });
    /** Calls to `getRoute` whose destination is an escape mark, not a shelter. */
    const escapeCalls = () => getRoute.mock.calls.filter(([, to]) => !SHELTERS.includes(to as Shelter));
    return { planner, getRoute, escapeCalls };
  }

  it("never calls getRoute for the escape leg until requested", async () => {
    const { planner, escapeCalls } = setup();
    planner.update(cityHall, [NEAR_FIRE]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(escapeCalls()).toHaveLength(0);
    expect(planner.getSnapshot().plan?.escape).toEqual({ kind: "not-requested" });
    expect(planner.getSnapshot().escapeRequested).toBe(false);
  });

  it("computes the escape route once requested, and keeps it updated", async () => {
    const { planner, escapeCalls } = setup();
    planner.update(cityHall, [NEAR_FIRE]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(escapeCalls()).toHaveLength(0);

    planner.requestEscape();
    expect(planner.getSnapshot().escapeRequested).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(escapeCalls().length).toBeGreaterThan(0);
    expect(planner.getSnapshot().plan?.escape.kind).toBe("route");

    // Later hazard changes keep recomputing the escape leg without asking again.
    const callsBefore = escapeCalls().length;
    planner.update(cityHall, [{ ...NEAR_FIRE, center: north(-1000) }]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(planner.getSnapshot().plan?.escape.kind).toBe("route");
    expect(escapeCalls().length).toBeGreaterThan(callsBefore);
  });

  it("clearing removes the escape route and stops requesting it", async () => {
    const { planner, escapeCalls } = setup();
    planner.update(cityHall, [NEAR_FIRE]);
    planner.requestEscape();
    await vi.advanceTimersByTimeAsync(1000);
    expect(planner.getSnapshot().plan?.escape.kind).toBe("route");
    const callsBeforeClear = escapeCalls().length;

    planner.clearEscape();
    expect(planner.getSnapshot().escapeRequested).toBe(false);
    expect(planner.getSnapshot().plan?.escape).toEqual({ kind: "not-requested" });

    planner.update(cityHall, SYNTHETIC_HAZARDS); // hazard change; escape must not be recomputed
    await vi.advanceTimersByTimeAsync(1000);
    expect(escapeCalls().length).toBe(callsBeforeClear);
    expect(planner.getSnapshot().plan?.escape).toEqual({ kind: "not-requested" });
  });
});
