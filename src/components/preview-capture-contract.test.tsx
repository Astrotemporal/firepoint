import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WildfireGuide } from "./wildfire-guide";

describe("/prepare screenshot capture contract", () => {
  it("keeps one title and one precise back link for the Playwright script", () => {
    const html = renderToStaticMarkup(<WildfireGuide />);
    const script = readFileSync("scripts/capture-preview.mjs", "utf8");
    expect(html.match(/id="guide-title"/g)).toHaveLength(1);
    expect(html.match(/<a[^>]*class="g-back"[^>]*href="\/"[^>]*>/g)).toHaveLength(1);
    expect(script).toContain('page.locator("#guide-title").waitFor()');
    expect(script).toContain(`page.locator('a.g-back[href="/"]').waitFor()`);
  });
});
