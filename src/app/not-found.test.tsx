import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// next/font/google only works inside the Next build; the page just needs the class names.
vi.mock("next/font/google", () => ({
  Montserrat: () => ({ variable: "font-sans" }),
  Playfair_Display: () => ({ variable: "font-serif" }),
}));

const { default: NotFound } = await import("./not-found");

const html = renderToStaticMarkup(<NotFound />);
const text = html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&");

describe("404 page", () => {
  it("says the address is off the map and names the status code", () => {
    expect(html).toMatch(/<main[^>]*class="not-found/);
    // English-only page: marked so a Spanish or Armenian document language doesn't mislabel it.
    expect(html).toMatch(/<main lang="en"/);
    expect(text).toContain("404");
    expect(text).toMatch(/Off the\s+map\./i);
  });

  it("points back to the map and the guide, in that order", () => {
    const map = html.indexOf('href="/"');
    const guide = html.indexOf('href="/prepare"');
    expect(map).toBeGreaterThan(-1);
    expect(guide).toBeGreaterThan(map);
  });

  it("keeps 911 in view, since a lost visitor may be in a hurry", () => {
    expect(text).toContain("call 911");
  });

  it("draws the route scene without a pathname on the server", () => {
    expect(html).toContain('class="nf-scene"');
    expect(html).toContain('class="nf-route"');
    expect(html).not.toContain("nf-path-code");
  });
});
