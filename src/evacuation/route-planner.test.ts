import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SAFE_ZONES, SHELTERS } from "./data/glendale";
import { TEST_HAZARDS } from "./hazards.fixture";
import { RoutePlanner } from "./route-planner";
import type { GetRoute, LatLng } from "./types";

const cityHall: LatLng = { lat: 34.14662, lng: -118.24825 };
/** ~`meters` north of City Hall. */
const north = (meters: number): LatLng => ({ lat: cityHall.lat + meters / 111_195, lng: cityHall.lng });

describe("RoutePlanner recalculation", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  function setup(online = true) {
    const getRoute = vi.fn<GetRoute>(async (from, to) => ({
      path: [from, to], distanceMeters: 1000, durationSeconds: 120, steps: [],
    }));
    const planner = new RoutePlanner({
      getRoute, shelters: SHELTERS, zones: SAFE_ZONES, isOnline: () => online,
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
    planner.update(north(0), TEST_HAZARDS);
    await vi.advanceTimersByTimeAsync(1000);
    expect(runs()).toBe(1); // same origin
    expect(planner.getSnapshot().plan?.hazardsKey).toContain("simulated-verdugo-fire");
  });

  it("offline, gives straight-line shelter targets without calling the routing API, and no escape unless requested", async () => {
    const { planner, getRoute } = setup(false);
    planner.update(cityHall, TEST_HAZARDS);
    await vi.advanceTimersByTimeAsync(1000);
    const plan = planner.getSnapshot().plan;
    expect(getRoute).not.toHaveBeenCalled();
    expect(plan?.shelter).toMatchObject({ kind: "routing-unavailable", reason: "offline", shelter: { id: "pacific-community-center" } });
    expect(plan?.escape).toEqual({ kind: "not-requested" });

    planner.requestEscape();
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
      getRoute, shelters: SHELTERS, zones: SAFE_ZONES, isOnline: () => true,
      debounceMs: 1000, minIntervalMs: 5000, now: () => Date.now(),
    });
    /** Calls to `getRoute` whose destination is a safe zone (has `priority`), not a shelter. */
    const escapeCalls = () => getRoute.mock.calls.filter(([, to]) => "priority" in to);
    return { planner, getRoute, escapeCalls };
  }

  it("never calls getRoute for the escape leg until requested", async () => {
    const { planner, escapeCalls } = setup();
    planner.update(cityHall, []);
    await vi.advanceTimersByTimeAsync(1000);
    expect(escapeCalls()).toHaveLength(0);
    expect(planner.getSnapshot().plan?.escape).toEqual({ kind: "not-requested" });
    expect(planner.getSnapshot().escapeRequested).toBe(false);
  });

  it("computes the escape route once requested, and keeps it updated", async () => {
    const { planner, escapeCalls } = setup();
    planner.update(cityHall, []);
    await vi.advanceTimersByTimeAsync(1000);
    expect(escapeCalls()).toHaveLength(0);

    planner.requestEscape();
    expect(planner.getSnapshot().escapeRequested).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(escapeCalls().length).toBeGreaterThan(0);
    expect(planner.getSnapshot().plan?.escape.kind).toBe("route");

    // Later hazard changes keep recomputing the escape leg without asking again.
    planner.update(cityHall, TEST_HAZARDS);
    await vi.advanceTimersByTimeAsync(1000);
    expect(planner.getSnapshot().plan?.escape.kind).toBe("route");
    expect(escapeCalls().length).toBeGreaterThan(1);
  });

  it("clearing removes the escape route and stops requesting it", async () => {
    const { planner, escapeCalls } = setup();
    planner.update(cityHall, []);
    planner.requestEscape();
    await vi.advanceTimersByTimeAsync(1000);
    expect(planner.getSnapshot().plan?.escape.kind).toBe("route");
    const callsBeforeClear = escapeCalls().length;

    planner.clearEscape();
    expect(planner.getSnapshot().escapeRequested).toBe(false);
    expect(planner.getSnapshot().plan?.escape).toEqual({ kind: "not-requested" });

    planner.update(cityHall, TEST_HAZARDS); // hazard change; escape must not be recomputed
    await vi.advanceTimersByTimeAsync(1000);
    expect(escapeCalls().length).toBe(callsBeforeClear);
    expect(planner.getSnapshot().plan?.escape).toEqual({ kind: "not-requested" });
  });
});
