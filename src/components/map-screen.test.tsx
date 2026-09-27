import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MapScreen } from "./map-screen";
import { Flame } from "./flame";
import { WildfireGuide } from "./wildfire-guide";
import Home from "../app/page";

// The homepage reads the saved language from request cookies; outside a request, use English.
vi.mock("@/i18n/server", () => ({ getLocale: async () => "en" }));
import { THEME_KEY, THEME_SCRIPT } from "./theme";

describe("map screen", () => {
  it("server-renders a placeholder instead of Leaflet, with the fire disabled until hydrated", () => {
    const html = renderToStaticMarkup(<MapScreen />);
    expect(html).toContain("Loading map…");
    expect(html).not.toContain("mapboxgl-map");
    expect(html).toMatch(/<button[^>]*class="fire-token"[^>]*disabled=""/);
    expect(html).toContain("Local to this device");
    expect(html).not.toContain('class="map-clear"');
  });

  it("frames marks as private orientation, never reports or live fire data", () => {
    const html = renderToStaticMarkup(<MapScreen />);
    expect(html).toMatch(/<button[^>]*class="fire-token"[^>]*aria-label="[^"]*Marks stay on this device and are not reports\."/);
    expect(html).toContain("Live fire data isn’t connected, so this is not an all-clear");
    expect(html).toContain("call 911");
  });

  it("puts a help button above the fire that opens a how-to dialog, with the 911 reminder", () => {
    const html = renderToStaticMarkup(<MapScreen />);
    expect(html).toMatch(/<div class="fire-stack"><button[^>]*class="map-help"[^>]*aria-label="How to use Firepoint"[\s\S]*?<\/dialog><button[^>]*class="fire-token"/);
    expect(html).toMatch(/<dialog[^>]*class="help-dialog"/);
    expect(html).toContain("Always follow official evacuation orders. To report a fire, call 911.");
  });

  it("is the whole homepage, with the prep and official-source page one link away", async () => {
    const html = renderToStaticMarkup(await Home());
    expect(html).toMatch(/class="map-screen[" ]/);
    expect(html).toContain('href="/prepare"');
    expect(html).not.toContain('class="hero"');
  });

  it("puts directions on the same screen as the fire marks", () => {
    const html = renderToStaticMarkup(<MapScreen />);
    expect(html).toContain('class="fire-token"');
    expect(html).toContain('class="ev-bar ev-sheet');
    expect(html).toContain("Use my location");
  });

  it("keeps the prep guide separate and links back to the map", () => {
    const html = renderToStaticMarkup(<WildfireGuide />);
    expect(html).not.toContain('class="map-screen"');
    const order = ['id="ready"', 'id="set"', 'id="go"'].map((k) => html.indexOf(k));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toMatch(/<a[^>]*href="\/"[^>]*>Map<\/a>/);
  });
});

describe("theme", () => {
  it("offers a light/dark toggle on the map", () => {
    expect(renderToStaticMarkup(<MapScreen />)).toMatch(/<button[^>]*class="theme-toggle"[^>]*aria-label="Switch to dark mode"/);
  });

  it("applies a saved choice or the system setting before paint, and never throws", () => {
    expect(THEME_SCRIPT).toContain(THEME_KEY);
    expect(THEME_SCRIPT).toContain("prefers-color-scheme: dark");
    expect(THEME_SCRIPT.startsWith("try{")).toBe(true);
  });
});

describe("flame artwork", () => {
  it("is hidden from screen readers", () => {
    expect(renderToStaticMarkup(<Flame />)).toContain('aria-hidden="true"');
  });
});
