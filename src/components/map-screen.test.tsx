import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MapScreen } from "./map-screen";
import { Flame } from "./flame";
import { FirepointHome } from "./firepoint-home";
import Home from "../app/page";

describe("map screen", () => {
  it("server-renders a placeholder instead of Leaflet, with the fire disabled until hydrated", () => {
    const html = renderToStaticMarkup(<MapScreen />);
    expect(html).toContain("Loading map…");
    expect(html).not.toContain("mapboxgl-map");
    expect(html).toMatch(/<button[^>]*class="fire-token"[^>]*disabled=""/);
    expect(html).toContain("Local to this device");
    expect(html).not.toContain("Clear all");
  });

  it("frames marks as private orientation, never reports or live fire data", () => {
    const html = renderToStaticMarkup(<MapScreen />);
    expect(html).toContain("are not reports");
    expect(html).toContain("does not show live fires, evacuation zones, or hazards");
    expect(html).toContain("call 911");
  });

  it("is the whole homepage, with the prep and official-source page one link away", () => {
    const html = renderToStaticMarkup(<Home />);
    expect(html).toContain('class="map-screen"');
    expect(html).toContain('href="/prepare"');
    expect(html).not.toContain('class="hero"');
  });

  it("keeps the prep page intact and links back to the map", () => {
    const html = renderToStaticMarkup(<FirepointHome />);
    expect(html).not.toContain('class="map-screen"');
    const order = ["/ 01", "/ 02", "/ 03", "/ 04"].map((k) => html.indexOf(k));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toMatch(/<a[^>]*href="\/"[^>]*>Map<\/a>/);
  });
});

describe("flame artwork", () => {
  it("is hidden from screen readers", () => {
    expect(renderToStaticMarkup(<Flame />)).toContain('aria-hidden="true"');
  });
});
