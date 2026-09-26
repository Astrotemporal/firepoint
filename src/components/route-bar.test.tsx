import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SAFE_ZONES, SHELTERS } from "@/evacuation/data/glendale";
import { SIMULATED_HAZARDS } from "@/evacuation/hazards";
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
      location={{ status: "tracking", fix: gps }} origin={gps} outsideAreaMeters={null} hazards={SIMULATED_HAZARDS}
      threat={null} escapeFirst={false} plan={plan} pending={false} online appleMaps={false} escapeRequested
      onUseLocation={noop} onManualLocation={noop} onRetryRoutes={noop} onToggleSimulated={noop}
      onRequestEscape={noop} onClearEscape={noop}
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
    expect(html).toContain("Demo: simulated fire, unverified shelters.");
  });

  it("lists the escape route first near a hazard, the shelter first otherwise", () => {
    const order = (html: string) => html.indexOf("Escape route") < html.indexOf("Nearest shelter") ? "escape" : "shelter";
    expect(order(render())).toBe("shelter");
    const near = render({ escapeFirst: true, threat: { hazard: SIMULATED_HAZARDS[0], edgeMeters: 1200 } });
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
      threat: { hazard: SIMULATED_HAZARDS[0], edgeMeters: 86 }, escapeFirst: true,
      plan: { ...plan, origin: sparrHeights, escape: { kind: "no-safe-route", zone: SAFE_ZONES[1] } },
    });
    expect(html).toContain("less than 0.1 mi away");
    expect(html).toContain("Head north, away from Simulated fire · Verdugo Mountains");
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

  it("says fire marks are private, not reports, and that routes avoid them", () => {
    const mark = { ...SIMULATED_HAZARDS[0], id: "mark-1", label: "Fire mark 1", simulated: false, userMark: true };
    const html = render({ hazards: [mark], threat: { hazard: mark, edgeMeters: 400 }, escapeFirst: true });
    expect(html).toContain("Fire marks stay on this device and are not reports; routes avoid them.");
    expect(html).toContain("Fire mark 1 is 0.2 mi away. Take the escape route.");
  });

  describe("escape route on request", () => {
    const notRequested = { escapeRequested: false, plan: { ...plan, escape: { kind: "not-requested" as const } } };

    it("shows a Get escape route button and no escape route content before it's requested", () => {
      const html = render(notRequested);
      expect(html).toContain("Get escape route");
      expect(html).not.toContain("toward Burbank via SR-134");
      expect(html).not.toContain("destination=34.180800"); // no Go link for the (unrequested) escape zone
      expect(html.match(/aria-expanded/g)).toHaveLength(1); // only the shelter row toggles
    });

    it("does not compute or highlight an escape route just because a start location exists", () => {
      // No request has happened yet; the plan carries no escape route to show.
      const html = render(notRequested);
      expect(html).not.toContain("ev-row-summary\">Head");
    });

    it("shows the full escape route, with a Clear control, once requested", () => {
      const html = render(); // default: escapeRequested + a resolved plan.escape
      expect(html).toContain("toward Burbank via SR-134 · 9 min");
      expect(html).toContain("Hide escape route");
      expect(html.match(/aria-expanded/g)).toHaveLength(2);
    });

    it("shows a pending message once requested but before a route comes back", () => {
      const html = render({ plan: { ...plan, escape: { kind: "not-requested" } } }); // escapeRequested: true (default)
      expect(html).toContain("Finding the fastest way out…");
    });

    it("points the hazard-proximity warning at the button before a request, and at the route after", () => {
      const near = { escapeFirst: true, threat: { hazard: SIMULATED_HAZARDS[0], edgeMeters: 1200 } };
      expect(render({ ...near, ...notRequested })).toContain("Tap Get escape route.");
      expect(render({ ...near, ...notRequested })).not.toContain("Take the escape route.");
      expect(render({ ...near, escapeRequested: true })).toContain("Take the escape route.");
    });
  });
});
