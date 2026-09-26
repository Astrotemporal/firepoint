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

  it("keeps the stylesheet on the same policy colours and desaturates every private flame", () => {
    const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
    expect(css).toContain(`--private-mark: ${PRIVATE_MARK_STYLE.paint.light.stroke};`);
    expect(css).toContain(`--private-mark: ${PRIVATE_MARK_STYLE.paint.dark.stroke};`);
    for (const selector of [".fire-pin-fire", ".fire-ghost", ".fire-token-flame"]) {
      const rule = css.split("\n").find((line) => line.startsWith(`${selector} {`));
      expect(rule, selector).toContain(PRIVATE_MARK_ICON_FILTER);
    }
    expect(css).not.toMatch(/\.ring-legend[^\n]*#(b91c1c|f87171|ef4444)/);
  });

  it("renders one identical grey legend whether one or many marks exist: no colour step, no aggregate UI", () => {
    const props = { ready: true, hint: null, map: { current: null }, onPlace: () => {}, onHint: () => {}, onClear: () => {} };
    const legend = (count: number) => renderToStaticMarkup(<FirePanel {...props} count={count} />).match(/<p class="ring-legend"[\s\S]*?<\/p>/)?.[0];
    expect(legend(1)).toContain("grey ring around each mark");
    expect(legend(1)).toBe(legend(3));
    expect(legend(3)).toBe(legend(20));
    for (const html of [legend(3), legend(20)]) expect(html).not.toMatch(/\d+ reports|activity|cell|verified|#(b91c1c|ef4444|f87171)/);
  });
});
