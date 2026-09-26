import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MapSection } from "./map-section";
import { FLAME_SVG, Flame } from "./flame";
import { FirepointHome } from "./firepoint-home";

describe("map section", () => {
  it("server-renders a placeholder instead of Leaflet, with the fire disabled until hydrated", () => {
    const html = renderToStaticMarkup(<MapSection />);
    expect(html).toContain("Loading map…");
    expect(html).not.toContain("leaflet-container");
    expect(html).toMatch(/<button[^>]*class="fire-token"[^>]*disabled=""/);
    expect(html).toContain("Local to this device");
    expect(html).not.toContain("Clear all");
  });

  it("frames marks as private orientation, never reports or live fire data", () => {
    const html = renderToStaticMarkup(<MapSection />);
    expect(html).toContain("They are not reports");
    expect(html).toContain("does not show live fires, evacuation zones, or hazards");
    expect(html).toContain("call 911");
  });

  it("sits between the hero and official sources with renumbered kickers", () => {
    const html = renderToStaticMarkup(<FirepointHome />);
    expect(html).toContain('href="#map"');
    const order = ["/ 02", "/ 03", "/ 04", "/ 05"].map((k) => html.indexOf(k));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html.indexOf('id="map"')).toBeLessThan(html.indexOf('id="official"'));
  });
});

describe("flame artwork", () => {
  it("keeps the React and Leaflet HTML versions identical and hidden from screen readers", () => {
    const html = renderToStaticMarkup(<Flame />);
    const paths = (s: string) => s.match(/<path[^>]*>/g)?.map((p) => p.replace(/\s*\/?>$/, ""));
    expect(paths(html)).toEqual(paths(FLAME_SVG));
    expect(html).toContain('aria-hidden="true"');
    expect(FLAME_SVG).toContain('aria-hidden="true"');
  });
});
