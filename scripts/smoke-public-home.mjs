// Browser smoke check for the public release gate. Run against a production build (`next build` + `next start`):
// the homepage must show the no-data statement and must never route, show shelters/escape UI or ask for location.
// Sets nothing up itself and never contacts Mapbox Directions; a directions request is a failure.
import { chromium } from "playwright";

const base = process.env.FIREPOINT_PREVIEW_URL ?? "http://127.0.0.1:3000";
const STATUS_TITLE = "No verified incident, shelter or route loaded";
const FORBIDDEN_SELECTORS = [".ev-escape-cta", ".ev-bar", ".ev-sheet", ".ev-go", ".ev-pin", ".ev-locate", ".ev-you", ".ev-start", ".ev-status", ".ev-form"];
const FORBIDDEN_TEXT = [
  "Escape", "Nearest shelter", "Allow location access", "Routes start from", "Enter address", "routes avoid",
  "Glendale Civic Auditorium", "Pacific Community Center", "Sparr Heights Community Center",
  "Glendale Galleria / I-5 corridor", "Burbank via SR-134",
];

const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };

const browser = await chromium.launch({ headless: true });
try {
  for (const [name, width, height] of [["mobile", 390, 844], ["desktop", 1440, 900]]) {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce" });
    // Count geolocation use instead of granting permission: the public page must never call it.
    await context.addInitScript(() => {
      window.__geolocationCalls = 0;
      const count = () => { window.__geolocationCalls += 1; return 0; };
      if (navigator.geolocation) {
        Object.defineProperty(navigator, "geolocation", {
          value: { getCurrentPosition: count, watchPosition: count, clearWatch: () => {} }, configurable: true,
        });
      }
    });
    const directions = [];
    const shippedPrototype = [];
    // The prototype must not even be shipped: no script the public page loads may carry its markup or provider URL.
    context.on("response", async (response) => {
      if (!response.url().includes("/_next/static/") || !response.url().endsWith(".js")) return;
      const body = await response.text().catch(() => "");
      if (/api\.mapbox\.com\/directions|ev-escape-cta|watchPosition/.test(body)) shippedPrototype.push(response.url());
    });
    await context.route("**/*", (route) => {
      const url = route.request().url();
      if (/api\.mapbox\.com\/(directions|geocoding|search)/.test(url)) { directions.push(url); return route.abort(); }
      return route.continue();
    });
    const page = await context.newPage();
    try {
      let response;
      for (let attempt = 0; attempt < 24; attempt += 1) {
        try { response = await page.goto(base + "/", { waitUntil: "domcontentloaded", timeout: 2000 }); break; }
        catch (error) { if (attempt === 23) throw error; await new Promise((resolve) => setTimeout(resolve, 250)); }
      }
      check(response?.status() === 200, `${name}: homepage returned ${response?.status()}`);
      await page.locator(".ev-public-status-title").waitFor();
      // Let hydration, stored-mark reads, service-worker registration and any (forbidden) effects run.
      await page.waitForTimeout(3000);
      const title = (await page.locator(".ev-public-status-title").textContent())?.trim();
      check(title === STATUS_TITLE, `${name}: status title was ${JSON.stringify(title)}`);
      check(await page.locator(".fire-token").count() === 1, `${name}: fire mark button missing`);
      check(await page.locator('a.map-brand[href="/prepare"]').count() === 1, `${name}: prep link missing`);
      for (const selector of FORBIDDEN_SELECTORS) check(await page.locator(selector).count() === 0, `${name}: found ${selector}`);
      const text = await page.locator("body").innerText();
      for (const needle of FORBIDDEN_TEXT) check(!text.includes(needle), `${name}: page text contains ${JSON.stringify(needle)}`);
      check(await page.evaluate(() => window.__geolocationCalls) === 0, `${name}: geolocation was requested`);
      check(directions.length === 0, `${name}: directions/geocoding requested: ${directions.join(", ")}`);
      check(shippedPrototype.length === 0, `${name}: prototype code shipped in ${shippedPrototype.join(", ")}`);
      const guide = await page.goto(base + "/prepare", { waitUntil: "domcontentloaded" });
      check(guide?.status() === 200 && await page.locator("#guide-title").count() === 1, `${name}: /prepare did not render`);
      console.log(`${name}: public homepage OK — ${JSON.stringify(title)}; geolocation calls 0; directions requests 0; prototype chunks 0`);
    } finally { await context.close(); }
  }
} finally { await browser.close(); }

if (failures.length) {
  console.error("Public release gate smoke FAILED:\n - " + failures.join("\n - "));
  process.exit(1);
}
