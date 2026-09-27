import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PRIVATE_MARK_ICON_FILTER, PRIVATE_MARK_STYLE, privateMarkPaint } from "@/domain/private-mark-style";
import { FirePanel } from "@/components/fire-panel";

const rgb = (hex: string) => [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16)) as [number, number, number];
/** Neutral: channels within 24 of each other, and never red-led. */
const isNeutralGrey = (hex: string) => { const [r, g, b] = rgb(hex); return Math.max(r, g, b) - Math.min(r, g, b) <= 24 && r <= Math.max(g, b); };

describe("private mark visual policy: neutral grey, independent of counts", () => {
  it("paints every private element grey in both themes, with no red or warm colour", () => {
    for (const theme of ["light", "dark"] as const) {
      const paint = privateMarkPaint(theme);
      expect(isNeutralGrey(paint.stroke)).toBe(true);
      expect(isNeutralGrey(paint.fill)).toBe(true);
      expect(paint.stroke).not.toMatch(/^#(b91c1c|ef4444|f87171|c2410c|f3875e|ffd27a)$/i);
    }
    expect(PRIVATE_MARK_STYLE.tone).toBe("neutral-grey");
    expect(PRIVATE_MARK_STYLE.fillOpacity).toBeLessThanOrEqual(0.1);
    expect(PRIVATE_MARK_ICON_FILTER).toBe("grayscale(1)");
  });

  it("exposes no count, threshold, report or status input that could change the colour", () => {
    for (const field of ["count", "threshold", "minReports", "reports", "severity", "status", "verified", "aggregate"]) {
      expect(PRIVATE_MARK_STYLE).not.toHaveProperty(field);
      expect(privateMarkPaint("light")).not.toHaveProperty(field);
    }
    expect(privateMarkPaint.length).toBe(1); // theme only
  });

  it("desaturates placed private flames while leaving the fire toolbox control colored", () => {
    const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
    expect(css).toContain(`--private-mark: ${PRIVATE_MARK_STYLE.paint.light.stroke};`);
    expect(css).toContain(`--private-mark: ${PRIVATE_MARK_STYLE.paint.dark.stroke};`);
    for (const selector of [".fire-pin-fire", ".fire-ghost"]) {
      const rule = css.split("\n").find((line) => line.startsWith(`${selector} {`));
      expect(rule, selector).toContain(PRIVATE_MARK_ICON_FILTER);
    }
    const toolboxRule = css.split("\n").find((line) => line.startsWith(".fire-token-flame {"));
    expect(toolboxRule).toBeDefined();
    expect(toolboxRule).not.toContain(PRIVATE_MARK_ICON_FILTER);
    expect(css).not.toMatch(/\.ring-legend[^\n]*#(b91c1c|f87171|ef4444)/);
  });

  it("draws no on-canvas text for private halos: the lang=\"en\" legend and popup carry the words", () => {
    const map = readFileSync(new URL("../components/evacuation-map.tsx", import.meta.url), "utf8");
    expect(map).not.toContain("private-mark-halos-label");
    expect(map).not.toContain('"text-field"');
    expect(privateMarkPaint("light")).not.toHaveProperty("labelHalo");
  });

  it("shows the same fire panel whether one or many marks exist: no colour step, no aggregate UI", () => {
    const props = { ready: true, hint: null, map: { current: null }, onPlace: () => {}, onHint: () => {}, onClear: () => {} };
    // Marks are drawn on the map as fire areas (red, as before the grey halos); the panel carries no legend.
    const panel = (count: number) => renderToStaticMarkup(<FirePanel {...props} count={count} />).replace(/\d+ marks?/g, "N marks");
    expect(panel(1)).not.toContain("ring-legend");
    expect(panel(3)).toBe(panel(20));
    for (const html of [panel(3), panel(20)]) expect(html).not.toMatch(/\d+ reports|activity|cell|verified/);
  });
});
