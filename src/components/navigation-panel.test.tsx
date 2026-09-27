import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { routeProgress, type NavState } from "@/evacuation/navigation";
import { destinationPoint } from "@/evacuation/routing";
import type { LocationState } from "@/evacuation/location";
import type { Route } from "@/evacuation/types";
import { MapTextProvider } from "./map-text";
import { NavigationPanel } from "./navigation-panel";

// Synthetic geometry only.
const start = { lat: 34.15, lng: -118.25 };
const corner = destinationPoint(start, 90, 1_000);
const end = destinationPoint(corner, 0, 500);
const route: Route = {
  path: [start, corner, end], distanceMeters: 1_500, durationSeconds: 300,
  steps: [
    { instruction: "SYNTHETIC depart", distanceMeters: 1_000, durationSeconds: 200, turn: "depart" },
    { instruction: "SYNTHETIC turn left onto Test St", distanceMeters: 500, durationSeconds: 100, turn: "left" },
    { instruction: "SYNTHETIC arrive", distanceMeters: 0, durationSeconds: 0, turn: "arrive" },
  ],
};
const tracking: LocationState = { status: "tracking", fix: { ...start, accuracyMeters: 10, source: "gps", label: null } };
const base: NavState = {
  target: { kind: "shelter", name: "SYNTHETIC SHELTER", destination: end },
  status: "navigating", route, progress: null, position: start, straight: { headingDegrees: 60, meters: 1_100 }, nearHazard: false, rerouteFailed: false,
};
const noon = () => Date.UTC(2026, 8, 26, 19, 0);
const render = (state: NavState, locale: "en" | "es" = "en", location: LocationState = tracking) => renderToStaticMarkup(
  <MapTextProvider locale={locale}><NavigationPanel state={state} location={location} onEnd={() => {}} now={noon} /></MapTextProvider>,
);

describe("NavigationPanel", () => {
  it("shows the next maneuver, distance to it, trip time, distance and an End button", () => {
    const html = render({ ...base, progress: routeProgress(route, destinationPoint(start, 90, 300)) });
    expect(html).toContain("SYNTHETIC turn left onto Test St");
    expect(html).toMatch(/ev-nav-distance">0\.4 mi</);
    expect(html).toContain("<strong>4 min</strong>");
    expect(html).toContain("0.7 mi");
    expect(html).toContain("To SYNTHETIC SHELTER");
    expect(html).toContain('aria-label="End navigation"');
    expect(html).toContain("isn’t checked for fire or road closures");
  });

  it("waits for GPS, and explains when location is blocked", () => {
    expect(render({ ...base, status: "waiting-for-gps", position: null, straight: null })).toContain("Waiting for GPS…");
    const blocked: LocationState = { status: "fallback", fix: { ...start, accuracyMeters: null, source: "default", label: null }, reason: "denied" };
    expect(render({ ...base, status: "waiting-for-gps", position: null, straight: null }, "en", blocked)).toContain("Navigation needs your location");
  });

  it("falls back to a straight-line arrow without a road route, and says so", () => {
    const html = render({ ...base, route: null, rerouteFailed: true });
    expect(html).toContain("Head northeast · 0.7 mi straight-line");
    expect(html).toContain("No road route right now");
  });

  it("announces arrival and warns when the route passes a hazard", () => {
    expect(render({ ...base, status: "arrived" })).toContain("You have arrived at SYNTHETIC SHELTER.");
    expect(render({ ...base, progress: routeProgress(route, start), nearHazard: true })).toContain("passes near a fire mark or hazard");
  });

  it("speaks the chosen language", () => {
    const html = render({ ...base, progress: routeProgress(route, destinationPoint(start, 90, 300)) }, "es");
    expect(html).toContain("A SYNTHETIC SHELTER");
    expect(html).toContain(">Terminar<");
    expect(html).toContain("no se verifica para incendios");
  });
});
