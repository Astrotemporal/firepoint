// Screenshot only the static, unloaded map UI. Never call source routes or record live alerts.
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

// The safety/prep page lives at /prepare; the homepage is the full-screen Mapbox map, which needs a token and tiles.
const url = new URL("/prepare", process.env.FIREPOINT_PREVIEW_URL ?? "http://127.0.0.1:3000").href;
const browser = await chromium.launch({ headless: true });
await mkdir("docs/preview", { recursive: true });
try {
  for (const [name, width, height] of [["mobile", 390, 844], ["desktop", 1440, 900]]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: "reduce" });
    try {
      let response;
      for (let attempt = 0; attempt < 24; attempt += 1) {
        try { response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 2000 }); break; }
        catch (error) { if (attempt === 23) throw error; await new Promise((resolve) => setTimeout(resolve, 250)); }
      }
      if (response?.status() !== 200) throw new Error(`Preview page returned ${response?.status()}`);
      await page.locator("#guide-title").waitFor();
      // The brand and the back link both mention "map"; target the actual back link.
      await page.locator('a.g-back[href="/"]').waitFor();
      // The merged main branch includes a first-load animation. Preview the useful page, not its transient overlay.
      if (await page.locator(".preloader").count()) {
        await page.locator(".preloader").waitFor({ state: "hidden", timeout: 10000 });
      }
      await page.screenshot({ path: `docs/preview/${name}.png`, fullPage: true, animations: "disabled" });
      console.log(`Captured ${name} preview (map not loaded; no live notice query)`);
    } finally { await page.close(); }
  }
} finally { await browser.close(); }
