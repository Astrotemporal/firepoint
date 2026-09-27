import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RING_DASH, type PrivateDisplayHalo } from "@/domain/ring-visual";
import { FirePanel } from "./fire-panel";
import { RingLegend } from "./ring-legend";
import { WildfireGuide } from "./wildfire-guide";

// Synthetic legend sample: no stored mark, no live data, a fixed dummy position.
const SYNTHETIC_HALO: PrivateDisplayHalo = {
  kind: "private-display-halo", meaning: "arbitrary-display-sketch", unit: "m", provenance: "this-device",
  id: "synthetic", center: { lat: 0, lng: 0 }, displayRadiusMeters: 500, label: "Fire mark 1",
};

describe("ring legend and figure accessibility", () => {
  it("names a private halo as a metre sketch with the shared dash, and hides the swatch from screen readers", () => {
    const html = renderToStaticMarkup(<RingLegend ring={SYNTHETIC_HALO} dashed note="around each mark." />);
    expect(html).toContain('data-ring-kind="private-display-halo"');
    expect(html).toContain("<strong>500 m · private sketch</strong>");
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"[^>]*focusable="false"/);
    expect(html).toContain(`stroke-dasharray="${RING_DASH.join(" ")}"`);
    expect(html).not.toMatch(/zone \d|order|warning|perimeter|\bft\b/i);
  });

  it("keeps the map panel free of a halo legend: marks are drawn as fire areas, never with a position", () => {
    const props = { ready: true, hint: null, map: { current: null }, onPlace: () => {}, onHint: () => {}, onClear: () => {} };
    for (const count of [0, 1]) {
      const html = renderToStaticMarkup(<FirePanel {...props} count={count} />);
      expect(html).not.toContain("ring-legend");
      expect(html).not.toMatch(/lat|lng|34\.\d/);
    }
  });

  it("keeps the /prepare defensible-space figure in feet with the same dashed outer edge, and no metre halo", () => {
    const html = renderToStaticMarkup(<WildfireGuide />);
    const svg = html.slice(html.indexOf('<svg class="g-rings"'), html.indexOf("</svg>"));
    expect(svg).toContain('aria-label="Defensible space: Zone 1 is 0 to 30 feet from the house, Zone 2 is 30 to 100 feet, Zone 3 is 100 to 200 feet."');
    // Drawn outermost first (so inner rings paint on top), to scale 0.9 px/ft; only the outer edge is dashed.
    expect(svg.match(/<circle[^>]*>/g)).toEqual([
      `<circle r="180" class="g-ring g-ring-3" stroke-dasharray="${RING_DASH.join(" ")}">`,
      '<circle r="90" class="g-ring g-ring-2">',
      '<circle r="27" class="g-ring g-ring-1">',
    ]);
    expect(svg).not.toMatch(/500|\bm\b|private|sketch/);
    expect(html).not.toContain("ring-legend");
  });

  it("keeps the same dashed circles under localized feet labels, with no English sketch text in ES or HY", () => {
    for (const [locale, feet, label] of [["es", "pies", "Espacio defendible"], ["hy", "ֆուտ", "Պաշտպանական տարածք"]] as const) {
      const html = renderToStaticMarkup(<WildfireGuide locale={locale} />);
      const svg = html.slice(html.indexOf('<svg class="g-rings"'), html.indexOf("</svg>"));
      expect(svg).toContain(`aria-label="${label}`);
      expect(svg.match(/<circle[^>]*>/g)?.map((tag) => tag.includes("stroke-dasharray"))).toEqual([true, false, false]);
      expect(svg.match(/<text[^>]*>[^<]*<\/text>/g)?.map((tag) => tag.replace(/<[^>]*>|<!-- -->/g, "").trim()))
        .toEqual([`30 ${feet}`, `100 ${feet}`, `200 ${feet}`]);
      expect(svg).not.toMatch(/\bft\b|private|sketch|500/);
    }
  });
});
