import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SAFE_ZONES, SHELTERS } from "@/evacuation/data/glendale";
import { SYNTHETIC_HAZARDS } from "../../tests/fixtures/synthetic-fire";
import { DEFAULT_FIX, type LocationFix } from "@/evacuation/location";
import type { RoutePlan } from "@/evacuation/route-planner";
import type { Route } from "@/evacuation/types";
import { RouteBar, type RouteBarProps } from "./route-bar";

// Synthetic routes and fixes; test-only.
const route: Route = {
  path: [DEFAULT_FIX, SHELTERS[1]], distanceMeters: 2338, durationSeconds: 226,
  steps: [{ instruction: "Turn left onto North Isabel Street.", distanceMeters: 57, durationSeconds: 12 }],
};
const gps: LocationFix = { lat: 34.14662, lng: -118.24825, accuracyMeters: 450, source: "gps", label: null };
const plan: RoutePlan<LocationFix> = {
  origin: gps, hazardsKey: "", computedAt: 1,
  shelter: { kind: "route", shelter: SHELTERS[1], route },
  escape: { kind: "route", zone: SAFE_ZONES[1], route: { ...route, durationSeconds: 540 } },
};
const noop = () => {};

function render(overrides: Partial<RouteBarProps> = {}) {
  return renderToStaticMarkup(
    <RouteBar
      location={{ status: "tracking", fix: gps }} origin={gps} outsideAreaMeters={null} hazards={SYNTHETIC_HAZARDS}
      threat={null} escapeFirst={false} plan={plan} pending={false} online appleMaps={false}
      onUseLocation={noop} onManualLocation={noop} onRetryRoutes={noop}
      {...overrides}
    />,
  );
}

describe("RouteBar", () => {
  it("shows both routes compactly with distance, time, a Go link, and (collapsed) steps", () => {
    const html = render();
    expect(html).toContain("Pacific Community Center · 1.5 mi · 4 min");
    expect(html).toContain("toward Burbank via SR-134 · 9 min");
    expect(html).toContain("https://www.google.com/maps/dir/?api=1&amp;destination=34.139830,-118.264780&amp;travelmode=driving");
    expect(html).toContain("Turn left onto North Isabel Street.");
    expect(html).toMatch(/aria-expanded="false"/);
    expect(html).toContain("Location approximate");
    expect(html).toContain("Unverified: confirm it’s open");
    expect(html).toContain("Shelters are unverified.");
    expect(html).not.toContain("Show simulated fire");
  });

  it("lists the escape route first near a hazard, the shelter first otherwise", () => {
    const order = (html: string) => html.indexOf("Escape route") < html.indexOf("Nearest shelter") ? "escape" : "shelter";
    expect(order(render())).toBe("shelter");
    const near = render({ escapeFirst: true, threat: { hazard: SYNTHETIC_HAZARDS[0], edgeMeters: 1200 } });
    expect(order(near)).toBe("escape");
    expect(near).toContain("Take the escape route.");
  });

  it("falls back to a compass arrow, straight-line distance, and address when routing fails", () => {
    const html = render({
      online: false,
      plan: { ...plan, shelter: { kind: "routing-unavailable", shelter: SHELTERS[1], reason: "offline" } },
    });
    expect(html).toContain("Offline: straight-line directions only.");
    expect(html).toContain("Pacific Community Center · southwest 1.1 mi straight-line");
    expect(html).toContain("Arrow pointing southwest");
    expect(html).toContain("501 S Pacific Ave, Glendale, CA 91204");
  });

  it("tells people to follow the evacuation route when no shelter route is clear", () => {
    const html = render({ plan: { ...plan, shelter: { kind: "no-safe-route", nearest: SHELTERS[1] } } });
    expect(html).toContain("No safe shelter route — follow evacuation route.");
  });

  it("near the fire with no clear road, points away from it and offers no link into it", () => {
    const sparrHeights: LocationFix = { ...SHELTERS[2], accuracyMeters: null, source: "manual", label: "Sparr Heights" };
    const html = render({
      location: { status: "manual", fix: sparrHeights }, origin: sparrHeights,
      threat: { hazard: SYNTHETIC_HAZARDS[0], edgeMeters: 86 }, escapeFirst: true,
      plan: { ...plan, origin: sparrHeights, escape: { kind: "no-safe-route", zone: SAFE_ZONES[1] } },
    });
    expect(html).toContain("less than 0.1 mi away");
    expect(html).toContain("Head north, away from SYNTHETIC TEST fire · Verdugo Mountains");
    expect(html).not.toContain("destination=34.180800,-118.309000");
  });

  it("asks for location on load, then offers an address after denial", () => {
    expect(render({ location: { status: "locating", fix: null, attempt: 1 }, origin: null, plan: null }))
      .toContain("Allow location access to see routes from where you are.");
    const denied = render({ location: { status: "fallback", reason: "denied", fix: DEFAULT_FIX }, origin: DEFAULT_FIX });
    expect(denied).toContain("Routes start from Glendale City Hall.");
    expect(denied).toContain("Enter address");
  });

  it("never treats an empty hazard list as an all-clear", () => {
    expect(render({ hazards: [] })).toContain("this is not an all-clear");
  });

  it("says private marks are not reports, do not affect routes, and empty feeds are not all-clears", () => {
    const html = render({ hazards: [], threat: null, escapeFirst: false });
    expect(html).toContain("Fire marks stay on this device; they are not reports and do not affect routes.");
    expect(html).toContain("this is not an all-clear");
    expect(html).not.toContain("Take the escape route.");
  });
});
