import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SHELTERS } from "@/evacuation/data/glendale";
import type { EscapeMark } from "@/evacuation/escape";
import { SYNTHETIC_HAZARDS } from "../../tests/fixtures/synthetic-fire";
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
/** A person's own fire mark, the only kind of fire the app shows. */
const fireMark = { ...SYNTHETIC_HAZARDS[0], id: "mark-1", label: "Fire mark 1", simulated: false, userMark: true };
const threat = { hazard: fireMark, edgeMeters: 900 };
/** Synthetic escape mark on a road southwest of the start, outside the danger zone. */
const mark: EscapeMark = { lat: 34.1308, lng: -118.2601, meters: 2100, fireMeters: 1750 };
const plan: RoutePlan<LocationFix> = {
  origin: gps, hazardsKey: "", computedAt: 1,
  shelter: { kind: "route", shelter: SHELTERS[1], route },
  escape: { kind: "route", mark, route: { ...route, durationSeconds: 540 }, threat, secondsToSafety: 240 },
};
const noop = () => {};

function render(overrides: Partial<RouteBarProps> = {}) {
  return renderToStaticMarkup(
    <RouteBar
      location={{ status: "tracking", fix: gps }} origin={gps} outsideAreaMeters={null} hazards={SYNTHETIC_HAZARDS}
      threat={null} escapeFirst={false} plan={plan} pending={false} online escapeRequested
      onUseLocation={noop} onManualLocation={noop} onRetryRoutes={noop}
      onRequestEscape={noop} onClearEscape={noop} onGo={noop}
      {...overrides}
    />,
  );
}

describe("RouteBar", () => {
  it("shows both routes compactly with distance, time, an in-app Go button, and (collapsed) steps", () => {
    const html = render();
    expect(html).toContain('<span class="ev-row-summary">Pacific Community Center</span><span class="ev-row-sub"><strong>4 min</strong> · 1.5 mi</span>');
    expect(html).toMatch(/Head southwest to safety<\/span><span class="ev-row-sub"><strong>9 min<\/strong> · 1.5 mi/);
    // Go starts navigation in the app: a button, never a link out to Apple or Google Maps.
    expect(html).toContain('<button type="button" class="ev-go ev-go-shelter">Go<span class="ev-sr-only">: start directions to Pacific Community Center</span></button>');
    expect(html).toContain('<button type="button" class="ev-go ev-go-escape">Go<span class="ev-sr-only">: start directions to Escape mark</span></button>');
    expect(html).not.toMatch(/maps\.apple\.com|google\.com\/maps/);
    expect(html).toContain("Escape mark 1.1 mi from Fire mark 1, outside the fire danger zone");
    expect(html).toContain("Out of the fire danger zone in about 4 min.");
    expect(html).toContain("Turn left onto North Isabel Street.");
    expect(html).toMatch(/aria-expanded="false"/);
    expect(html).toContain("Location approximate");
    expect(html).toContain("Unverified: confirm it’s open");
    expect(html).not.toMatch(/simulated fire/i); // no demo fire or toggle in the app
    expect(html).not.toMatch(/🏠|🚗/); // row icons are drawn glyphs, not emoji
    expect(html).toMatch(/<span class="ev-row-icon ev-row-icon-image" aria-hidden="true"><img alt=""[^>]*src="[^"]*shelter-icon[^"]*\.png"/);
    expect(html.match(/ev-row-icon-image/g)).toHaveLength(1); // the escape row keeps its glyph
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
    const near = render({ threat: { hazard: SYNTHETIC_HAZARDS[0], edgeMeters: 900 }, escapeFirst: true });
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

  it("near the fire with no clear road, points away from it and offers no link or line into it", () => {
    const sparrHeights: LocationFix = { ...SHELTERS[3], accuracyMeters: null, source: "manual", label: "Sparr Heights" };
    const near = { hazard: SYNTHETIC_HAZARDS[0], edgeMeters: 86 };
    const html = render({
      location: { status: "manual", fix: sparrHeights }, origin: sparrHeights, threat: near, escapeFirst: true,
      plan: { ...plan, origin: sparrHeights, escape: { kind: "no-safe-route", bearing: 10, threat: near } },
    });
    expect(html).toContain("less than 0.1 mi away");
    expect(html).toContain("Head north, away from SYNTHETIC TEST fire · Verdugo Mountains");
    expect(html).toContain("Every road route out passes close to the fire.");
    expect(html).not.toContain("ev-go-escape");
  });

  it("without a road route, names the direction to the escape mark and hands the mark to the maps app", () => {
    const html = render({ online: false, plan: { ...plan, escape: { kind: "routing-unavailable", mark, reason: "offline", threat } } });
    expect(html).toContain('Head southwest to safety</span><span class="ev-row-sub">1.3 mi straight-line');
    expect(html).toContain('class="ev-go ev-go-escape">Go<span class="ev-sr-only">: start directions to Escape mark');
    expect(html).toContain("Outside the fire danger zone: more than 1.0 mi from any marked fire");
  });

  it("says so when there is no fire to escape, or the start is already outside the danger zone", () => {
    expect(render({ plan: { ...plan, escape: { kind: "no-fire" } } })).toContain("No fire marked.");
    const safe = render({ plan: { ...plan, escape: { kind: "already-safe", threat: { ...threat, edgeMeters: 3000 } } } });
    expect(safe).toContain("You’re outside the fire danger zone, 1.9 mi from Fire mark 1.");
    expect(safe).not.toContain("ev-go-escape");
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

  it("labels private halos as sketches, and never treats an empty incident feed as an all-clear", () => {
    const html = render({ hazards: [], threat: null, escapeFirst: false, escapeRequested: false,
      plan: { ...plan, escape: { kind: "not-requested" } } });
    expect(html).toContain('lang="en"');
    expect(html).toContain("The shaded red areas are your private fire marks: sketches, not reports or measured fire extents.");
    expect(html).toContain("this is not an all-clear");
    expect(html).not.toContain("Take the escape route.");
  });

  it("treats a nearby fire mark like a hazard, without calling it simulated", () => {
    const mark = { ...SYNTHETIC_HAZARDS[0], id: "mark-1", label: "Fire mark 1", simulated: false, userMark: true };
    const near = { hazard: mark, edgeMeters: 400 };
    const html = render({ hazards: [mark], threat: near, escapeFirst: true, plan: { ...plan, escape: { ...plan.escape, threat: near } as typeof plan.escape } });
    expect(html).toContain("Fire mark 1 is 0.2 mi away. Take the escape route.");
    expect(html).not.toMatch(/simulated/i);
  });

  describe("escape route on request", () => {
    const notRequested = { escapeRequested: false, plan: { ...plan, escape: { kind: "not-requested" as const } } };

    it("shows an ESCAPE button and no escape route content before it's requested", () => {
      const html = render(notRequested);
      expect(html).toMatch(/<button[^>]*class="ev-escape-cta"[^>]*aria-label="Escape: get an escape route"[^>]*>.*Escape<\/button>/);
      expect(html).not.toContain("to safety");
      expect(html).not.toContain("ev-go-escape"); // no Go link for an (unrequested) escape route
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
      expect(html).toContain("Head southwest to safety");
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
      const near = { escapeFirst: true, threat: { hazard: SYNTHETIC_HAZARDS[0], edgeMeters: 1200 } };
      expect(render({ ...near, ...notRequested })).toContain("Tap Escape.");
      expect(render({ ...near, ...notRequested })).not.toContain("Take the escape route.");
      expect(render({ ...near, escapeRequested: true })).toContain("Take the escape route.");
    });
  });
});
