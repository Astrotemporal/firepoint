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

  it("shows the halo legend on the map panel only once a mark exists, never with a position", () => {
    const props = { ready: true, hint: null, map: { current: null }, onPlace: () => {}, onHint: () => {}, onClear: () => {} };
    expect(renderToStaticMarkup(<FirePanel {...props} count={0} />)).not.toContain("ring-legend");
    const html = renderToStaticMarkup(<FirePanel {...props} count={1} />);
    expect(html).toContain('class="ring-legend" data-ring-kind="private-display-halo"');
    expect(html).toContain("500 m · private sketch");
    expect(html).toContain("Not a zone, perimeter or report; routes ignore it.");
    expect(html).not.toMatch(/lat|lng|34\.\d/);
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
});
