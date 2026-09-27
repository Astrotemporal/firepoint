// Browser smoke check run by CI against a production build (`next build` + `next start`):
// the homepage loads and renders the map screen with the fire tile and the Escape button.
import { chromium } from "playwright";

const base = process.env.FIREPOINT_PREVIEW_URL ?? "http://127.0.0.1:3000";
const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };

const browser = await chromium.launch({ headless: true });
try {
  for (const [name, width, height] of [["mobile", 390, 844], ["desktop", 1440, 900]]) {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce" });
    const page = await context.newPage();
    try {
      let response;
      for (let attempt = 0; attempt < 24; attempt += 1) {
        try { response = await page.goto(base + "/", { waitUntil: "domcontentloaded", timeout: 2000 }); break; }
        catch (error) { if (attempt === 23) throw error; await new Promise((resolve) => setTimeout(resolve, 250)); }
      }
      check(response?.status() === 200, `${name}: homepage returned ${response?.status()}`);
      await page.locator(".fire-token").waitFor();
      check(await page.locator(".ev-escape-cta").count() > 0, `${name}: Escape button missing`);
      check(await page.locator('a.map-brand[href="/prepare"]').count() === 1, `${name}: prep link missing`);
      console.log(`${name}: homepage OK`);
    } finally { await context.close(); }
  }
} finally { await browser.close(); }

if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
