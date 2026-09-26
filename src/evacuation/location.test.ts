import { describe, expect, it } from "vitest";
import { DEFAULT_FIX, isApproximate, LocationTracker, type LocationEnvironment } from "./location";

type Callbacks = { success: PositionCallback; error: PositionErrorCallback; options?: PositionOptions };

/** Controllable stand-in for navigator.geolocation. */
function fakeGeolocation() {
  const watches = new Map<number, Callbacks>();
  let nextId = 1;
  const geolocation = {
    watchPosition(success: PositionCallback, error?: PositionErrorCallback | null, options?: PositionOptions) {
      watches.set(nextId, { success, error: error!, options });
      return nextId++;
    },
    clearWatch(id: number) { watches.delete(id); },
  };
  const latest = () => [...watches.values()].at(-1)!;
  return {
    geolocation,
    watches,
    fix(lat: number, lng: number, accuracy: number) {
      latest().success({ coords: { latitude: lat, longitude: lng, accuracy } } as GeolocationPosition);
    },
    fail(code: 1 | 2 | 3) { latest().error({ code } as GeolocationPositionError); },
  };
}

/** Controllable stand-in for the Permissions API's geolocation status. */
function fakePermission(state: PermissionState) {
  const listeners = new Set<() => void>();
  const status = {
    state,
    addEventListener: (_type: string, listener: () => void) => { listeners.add(listener); },
    removeEventListener: (_type: string, listener: () => void) => { listeners.delete(listener); },
  };
  return {
    listeners,
    queryPermission: () => Promise.resolve(status as unknown as PermissionStatus),
    change(next: PermissionState) {
      status.state = next;
      listeners.forEach((listener) => listener());
    },
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function tracker(fake: ReturnType<typeof fakeGeolocation>, overrides: Partial<LocationEnvironment> = {}) {
  return new LocationTracker(() => ({ geolocation: fake.geolocation, secureContext: true, ...overrides }));
}

describe("LocationTracker", () => {
  it("starts watching on page load with the required options", () => {
    const fake = fakeGeolocation();
    const location = tracker(fake);
    expect(location.getSnapshot().status).toBe("idle");
    location.activate();
    expect(location.getSnapshot()).toMatchObject({ status: "locating", attempt: 1 });
    expect([...fake.watches.values()][0].options).toEqual({ enableHighAccuracy: true, maximumAge: 10_000, timeout: 15_000 });
    fake.fix(34.15, -118.25, 250);
    const state = location.getSnapshot();
    expect(state).toMatchObject({ status: "tracking", fix: { lat: 34.15, lng: -118.25, source: "gps" } });
    expect(isApproximate(state.fix)).toBe(true);
    fake.fix(34.15, -118.25, 20);
    expect(isApproximate(location.getSnapshot().fix)).toBe(false);
  });

  it("falls back to Glendale City Hall when permission is denied", () => {
    const fake = fakeGeolocation();
    const location = tracker(fake);
    location.start();
    fake.fail(1);
    expect(location.getSnapshot()).toEqual({ status: "fallback", reason: "denied", fix: DEFAULT_FIX });
    expect(fake.watches.size).toBe(0);
  });

  it("tells a closed prompt (it can ask again) apart from a site where location is blocked", async () => {
    const fake = fakeGeolocation();
    const permission = fakePermission("prompt");
    const location = tracker(fake, { queryPermission: permission.queryPermission });
    location.activate();
    await settle();
    fake.fail(1);
    expect(location.getSnapshot()).toMatchObject({ status: "fallback", reason: "dismissed" });
    permission.change("denied");
    expect(location.getSnapshot()).toMatchObject({ status: "fallback", reason: "denied" });
    permission.change("prompt");
    expect(location.getSnapshot()).toMatchObject({ status: "fallback", reason: "dismissed" });
  });

  it("starts by itself when location is allowed in browser settings", async () => {
    const fake = fakeGeolocation();
    const permission = fakePermission("denied");
    const location = tracker(fake, { queryPermission: permission.queryPermission });
    location.activate();
    await settle();
    fake.fail(1);
    expect(location.getSnapshot()).toMatchObject({ status: "fallback", reason: "denied" });
    permission.change("granted");
    expect(location.getSnapshot()).toMatchObject({ status: "locating", granted: true });
    fake.fix(34.15, -118.25, 20);
    expect(location.getSnapshot()).toMatchObject({ status: "tracking", fix: { source: "gps" } });
  });

  it("knows when location is already allowed, so there is nothing to ask", async () => {
    const fake = fakeGeolocation();
    const permission = fakePermission("granted");
    const location = tracker(fake, { queryPermission: permission.queryPermission });
    location.activate();
    expect(location.getSnapshot()).toMatchObject({ status: "locating", granted: false });
    await settle();
    expect(location.getSnapshot()).toMatchObject({ status: "locating", granted: true });
    location.stop();
    expect(permission.listeners.size).toBe(0);
  });

  it("treats a denial as blocked when the browser can't report the permission", () => {
    const fake = fakeGeolocation();
    const location = tracker(fake);
    location.activate();
    fake.fail(1);
    expect(location.getSnapshot()).toMatchObject({ status: "fallback", reason: "denied" });
  });

  it("retries once on timeout, then falls back, and upgrades if a fix arrives later", () => {
    const fake = fakeGeolocation();
    const location = tracker(fake);
    location.start();
    fake.fail(3);
    expect(location.getSnapshot()).toMatchObject({ status: "locating", attempt: 2 });
    fake.fail(2);
    expect(location.getSnapshot()).toMatchObject({ status: "fallback", reason: "unavailable" });
    fake.fix(34.16, -118.26, 30);
    expect(location.getSnapshot()).toMatchObject({ status: "tracking", fix: { lat: 34.16 } });
  });

  it("keeps the last fix through a transient timeout while tracking", () => {
    const fake = fakeGeolocation();
    const location = tracker(fake);
    location.start();
    fake.fix(34.15, -118.25, 20);
    fake.fail(3);
    expect(location.getSnapshot()).toMatchObject({ status: "tracking", fix: { lat: 34.15 } });
  });

  it("explains HTTPS instead of calling geolocation on an insecure page", () => {
    const fake = fakeGeolocation();
    const location = tracker(fake, { secureContext: false });
    location.activate();
    expect(location.getSnapshot()).toMatchObject({ status: "fallback", reason: "insecure" });
    expect(fake.watches.size).toBe(0);
  });

  it("restarts a paused watch instead of starting over (unmount/remount)", () => {
    const fake = fakeGeolocation();
    const location = tracker(fake);
    location.activate();
    fake.fix(34.15, -118.25, 20);
    location.stop();
    expect(fake.watches.size).toBe(0);
    location.activate();
    expect(fake.watches.size).toBe(1);
    expect(location.getSnapshot()).toMatchObject({ status: "tracking", fix: { lat: 34.15 } });
  });

  it("stops watching for a manual address", () => {
    const fake = fakeGeolocation();
    const location = tracker(fake);
    location.start();
    location.setManual({ lat: 34.2, lng: -118.23 }, "1613 Glencoe Way");
    expect(location.getSnapshot()).toMatchObject({ status: "manual", fix: { source: "manual", label: "1613 Glencoe Way" } });
    expect(fake.watches.size).toBe(0);
  });
});
