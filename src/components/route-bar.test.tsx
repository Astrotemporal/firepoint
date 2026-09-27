import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SAFE_ZONES, SHELTERS } from "@/evacuation/data/glendale";
import { TEST_HAZARDS } from "@/evacuation/hazards.fixture";
import { DEFAULT_FIX, type LocationFix } from "@/evacuation/location";
import type { RoutePlan } from "@/evacuation/route-planner";
import type { Route } from "@/evacuation/types";
import { RouteBar, type RouteBarProps } from "./route-bar";

// Synthetic routes and fixes; test-only.
const route: Route = {
  path: [DEFAULT_FIX, SHELTERS[1]], distanceMeters: 2338, durationSeconds: 226,
  steps: [
    { instruction: "Turn left onto North Isabel Street.", distanceMeters: 57, durationSeconds: 12, turn: "left" },
    { instruction: "You have arrived at your destination.", distanceMeters: 0, durationSeconds: 0, turn: "arrive" },
  ],
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
      location={{ status: "tracking", fix: gps }} origin={gps} outsideAreaMeters={null} hazards={TEST_HAZARDS}
      threat={null} escapeFirst={false} plan={plan} pending={false} online appleMaps={false} escapeRequested
      onUseLocation={noop} onManualLocation={noop} onRetryRoutes={noop}
      onRequestEscape={noop} onClearEscape={noop}
      {...overrides}
    />,
  );
}

describe("RouteBar", () => {
  it("shows both routes compactly with distance, time, a Go link, and (collapsed) steps", () => {
    const html = render();
    expect(html).toContain('<span class="ev-row-summary">Pacific Community Center</span><span class="ev-row-sub"><strong>4 min</strong> · 1.5 mi</span>');
    expect(html).toMatch(/toward Burbank via SR-134<\/span><span class="ev-row-sub"><strong>9 min<\/strong> · 1.5 mi/);
    expect(html).toContain("https://www.google.com/maps/dir/?api=1&amp;destination=34.139830,-118.264780&amp;travelmode=driving");
    expect(html).toContain("Turn left onto North Isabel Street.");
    expect(html).toMatch(/aria-expanded="false"/);
    expect(html).toContain("Location approximate");
    expect(html).toContain("Unverified: confirm it’s open");
    expect(html).not.toMatch(/simulated fire/i); // no demo fire or toggle in the app
    expect(html).not.toMatch(/🏠|🚗/); // row icons are drawn glyphs, not emoji
  });

  it("labels details with icons and gives each step a turn arrow, its distance in bold", () => {
    const html = render();
    for (const icon of ["pin", "warning", "paw", "accessible", "info"]) expect(html).toContain(`ev-icon-${icon}`);
    expect(html).toContain('data-turn="left"');
    expect(html).toContain('data-turn="arrive"');
    expect(html).toMatch(/<strong class="ev-step-distance">200 ft<\/strong>/);
  });

  it("keeps the escape route at the top of the drawer once requested, with the fire warning in the peek", () => {
    const html = render();
    expect(html.indexOf("Escape route")).toBeLessThan(html.indexOf("Nearest shelter"));
    expect(html.indexOf("Escape route")).toBeLessThan(html.indexOf('id="ev-sheet-body"'));
    const near = render({ threat: { hazard: TEST_HAZARDS[0], edgeMeters: 900 }, escapeFirst: true });
    expect(near.indexOf("Take the escape route.")).toBeLessThan(near.indexOf('id="ev-sheet-body"'));
  });

  it("falls back to a compass arrow, straight-line distance, and address when routing fails", () => {
    const html = render({
      online: false,
      plan: { ...plan, shelter: { kind: "routing-unavailable", shelter: SHELTERS[1], reason: "offline" } },
    });
    expect(html).toContain("Offline: straight-line directions only.");
    expect(html).toContain('<span class="ev-row-summary">Pacific Community Center</span><span class="ev-row-sub">southwest 1.1 mi straight-line</span>');
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
      threat: { hazard: TEST_HAZARDS[0], edgeMeters: 86 }, escapeFirst: true,
      plan: { ...plan, origin: sparrHeights, escape: { kind: "no-safe-route", zone: SAFE_ZONES[1] } },
    });
    expect(html).toContain("less than 0.1 mi away");
    expect(html).toContain("Head north, away from Simulated fire · Verdugo Mountains");
    expect(html).not.toContain("destination=34.180800,-118.309000");
  });

  it("offers one button that asks for location, and an address instead", () => {
    const idle = render({ location: { status: "idle", fix: null }, origin: null, plan: null });
    expect(idle).toMatch(/<button[^>]*class="ev-ask-button"[^>]*>.*Use my location<\/button>/);
    expect(idle).toContain("Enter address");
    const prompt = render({ location: { status: "fallback", reason: "prompt", fix: DEFAULT_FIX }, origin: DEFAULT_FIX });
    expect(prompt).toContain("From Glendale City Hall");
    expect(prompt).toContain("ev-ask-button");
  });

  it("says where routes start when location is blocked, without a button that can't work", () => {
    const denied = render({ location: { status: "fallback", reason: "denied", fix: DEFAULT_FIX }, origin: DEFAULT_FIX });
    expect(denied).toContain("From Glendale City Hall · Location off");
    expect(denied).toContain("Enter address");
    expect(denied).not.toContain("ev-ask-button");
  });

  it("doesn't show the button while the browser's prompt is up", () => {
    const html = render({ location: { status: "locating", fix: null, attempt: 1 }, origin: null, plan: null });
    expect(html).not.toContain("ev-ask-button");
  });

  it("never treats an empty hazard list as an all-clear", () => {
    expect(render({ hazards: [] })).toContain("this is not an all-clear");
  });

  it("treats a nearby fire mark like a hazard, without calling it simulated", () => {
    const mark = { ...TEST_HAZARDS[0], id: "mark-1", label: "Fire mark 1", simulated: false, userMark: true };
    const html = render({ hazards: [mark], threat: { hazard: mark, edgeMeters: 400 }, escapeFirst: true });
    expect(html).toContain("Fire mark 1 is 0.2 mi away. Take the escape route.");
    expect(html).not.toMatch(/simulated/i);
  });

  describe("escape route on request", () => {
    const notRequested = { escapeRequested: false, plan: { ...plan, escape: { kind: "not-requested" as const } } };

    it("shows an ESCAPE button and no escape route content before it's requested", () => {
      const html = render(notRequested);
      expect(html).toMatch(/<button[^>]*class="ev-escape-cta"[^>]*aria-label="Escape: get an escape route"[^>]*>.*Escape<\/button>/);
      expect(html).not.toContain("toward Burbank via SR-134");
      expect(html).not.toContain("destination=34.180800"); // no Go link for the (unrequested) escape zone
      expect(html.match(/class="ev-row-main" aria-expanded/g)).toHaveLength(1); // only the shelter row toggles
    });

    it("brands the ESCAPE button with the animated fire instead of a car", () => {
      const cta = render(notRequested).match(/<button[^>]*class="ev-escape-cta".*?<\/button>/)?.[0] ?? "";
      expect(cta).toContain('class="ev-escape-fire"');
      expect(cta).not.toContain("🚗");
    });

    it("does not compute or highlight an escape route just because a start location exists", () => {
      // No request has happened yet; the plan carries no escape route to show.
      const html = render(notRequested);
      expect(html).not.toContain("ev-row-summary\">Head");
    });

    it("shows the full escape route, with a Clear control, once requested", () => {
      const html = render(); // default: escapeRequested + a resolved plan.escape
      expect(html).toContain("toward Burbank via SR-134");
      expect(html).toContain("<strong>9 min</strong>");
      expect(html).toContain("Hide escape route");
      expect(html.match(/class="ev-row-main" aria-expanded/g)).toHaveLength(2);
    });

    it("keeps the hide control visible on the escape row, not inside its collapsed details", () => {
      const html = render();
      const close = html.search(/<button[^>]*class="ev-escape-close"[^>]*aria-label="Hide escape route"/);
      expect(close).toBeGreaterThan(-1);
      expect(close).toBeLessThan(html.indexOf('class="ev-row-details"'));
    });

    it("marks the drawer idle (phones show only the button) until escape is requested", () => {
      expect(render(notRequested)).toMatch(/class="[^"]*ev-sheet-idle/);
      expect(render()).not.toContain("ev-sheet-idle");
    });

    it("shows a pending message once requested but before a route comes back", () => {
      const html = render({ plan: { ...plan, escape: { kind: "not-requested" } } }); // escapeRequested: true (default)
      expect(html).toContain("Finding the fastest way out…");
    });

    it("points the hazard-proximity warning at the button before a request, and at the route after", () => {
      const near = { escapeFirst: true, threat: { hazard: TEST_HAZARDS[0], edgeMeters: 1200 } };
      expect(render({ ...near, ...notRequested })).toContain("Tap Escape.");
      expect(render({ ...near, ...notRequested })).not.toContain("Take the escape route.");
      expect(render({ ...near, escapeRequested: true })).toContain("Take the escape route.");
    });
  });
});
