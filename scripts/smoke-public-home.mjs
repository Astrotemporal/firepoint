// Browser smoke check for the public release gate. Run against a production build (`next build` + `next start`):
// the homepage must show the no-data statement and must never route, show shelters/escape UI or ask for location.
// Sets nothing up itself and never contacts Mapbox Directions; a directions request is a failure.
import { chromium } from "playwright";

const base = process.env.FIREPOINT_PREVIEW_URL ?? "http://127.0.0.1:3000";
const STATUS_TITLE = "Shelter status unavailable — no verified open-shelter feed loaded";
const FORBIDDEN_SELECTORS = [".ev-escape-cta", ".ev-bar", ".ev-sheet", ".ev-go", ".ev-pin", ".ev-locate", ".ev-ask-button", ".ev-you", ".ev-start", ".ev-status", ".ev-form"];
const FORBIDDEN_TEXT = [
  "Escape", "Nearest shelter", "Allow location access", "Use my location", "Routes start from", "Enter address", "routes avoid",
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
    // (Mapbox GL's own unused GeolocateControl also contains "watchPosition", so that word is not a signal here;
    // real geolocation use is counted at runtime above.)
    context.on("response", async (response) => {
      if (!response.url().includes("/_next/static/") || !response.url().endsWith(".js")) return;
      const body = await response.text().catch(() => "");
      if (/api\.mapbox\.com\/directions|ev-escape-cta|ev-sheet-handle|ev-ask-button/.test(body)) shippedPrototype.push(response.url());
    });
    await context.route("**/*", (route) => {
      const url = route.request().url();
      if (/api\.mapbox\.com\/(directions|geocoding|search)/.test(url)) { directions.push(url); return route.abort(); }
      return route.continue();
    });
    const page = await context.newPage();
    try {
      // English (no cookie), then Spanish and Armenian via the saved-language cookie. Same gate, same English status.
      for (const locale of ["en", "es", "hy"]) {
        await context.clearCookies();
        if (locale !== "en") await context.addCookies([{ name: "firepoint.lang", value: locale, url: base }]);
        let response;
        for (let attempt = 0; attempt < 24; attempt += 1) {
          try { response = await page.goto(base + "/", { waitUntil: "domcontentloaded", timeout: 2000 }); break; }
          catch (error) { if (attempt === 23) throw error; await new Promise((resolve) => setTimeout(resolve, 250)); }
        }
        check(response?.status() === 200, `${name}/${locale}: homepage returned ${response?.status()}`);
        await page.locator(".ev-pub-sheet").waitFor();
        // Let hydration, stored-mark reads, service-worker registration and any (forbidden) effects run.
        await page.waitForTimeout(3000);
        const title = (await page.locator(".ev-pub-row").first().textContent())?.trim();
        check(title?.includes("Shelter status unavailable") === true, `${name}/${locale}: shelter unavailable row was ${JSON.stringify(title)}`);
        check(await page.locator(`main[lang="${locale}"]`).count() === 1, `${name}/${locale}: main is not lang=${locale}`);
        check(await page.locator('section.ev-pub-sheet[lang="en"]').count() === 1, `${name}/${locale}: status drawer is not marked lang=en`);
        check(await page.locator(".fire-token").count() === 1, `${name}/${locale}: fire mark button missing`);
        check(await page.locator('a.map-brand[href="/prepare"]').count() === 1, `${name}/${locale}: prep link missing`);
        check(await page.locator(`select.lang-select option[value="${locale}"]:checked`).count() === 1, `${name}/${locale}: language select not on ${locale}`);
        for (const selector of FORBIDDEN_SELECTORS) check(await page.locator(selector).count() === 0, `${name}/${locale}: found ${selector}`);
        const text = await page.locator("body").innerText();
        for (const needle of FORBIDDEN_TEXT) check(!text.includes(needle), `${name}/${locale}: page text contains ${JSON.stringify(needle)}`);
        if (locale === "en") {
          check(await page.locator(".ev-public-status-english-only").count() === 0, `${name}/en: English-only notice shown on English`);
        } else {
          const englishOnly = (await page.locator(".ev-public-status-english-only").textContent())?.trim();
          check(englishOnly === "Map status is available in English only.", `${name}/${locale}: fallback line was ${JSON.stringify(englishOnly)}`);
          const localized = await page.locator(`.ev-public-status-localized[lang="${locale}"]`).textContent();
          check(localized?.includes("911") === true, `${name}/${locale}: localized 911 line missing`);
        }
        check(await page.evaluate(() => window.__geolocationCalls) === 0, `${name}/${locale}: geolocation was requested`);
        check(directions.length === 0, `${name}/${locale}: directions/geocoding requested: ${directions.join(", ")}`);
        check(shippedPrototype.length === 0, `${name}/${locale}: prototype code shipped in ${shippedPrototype.join(", ")}`);
        console.log(`${name}/${locale}: public homepage OK — ${JSON.stringify(title)}; geolocation calls 0; directions requests 0; prototype chunks 0${locale === "en" ? "" : "; English-only notice shown"}`);
      }
      await context.clearCookies();
      const guide = await page.goto(base + "/prepare", { waitUntil: "domcontentloaded" });
      check(guide?.status() === 200 && await page.locator("#guide-title").count() === 1, `${name}: /prepare did not render`);
      console.log(`${name}: /prepare OK`);
    } finally { await context.close(); }
  }

  // Service worker migration: an old prototype cache is purged on the first successful online update, the public
  // shell is what gets cached, and an offline "/" serves that shell (or the offline page), never the prototype.
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addInitScript(async () => {
      if (!("caches" in window) || sessionStorage.getItem("seeded")) return;
      sessionStorage.setItem("seeded", "1");
      const cache = await caches.open("firepoint-shell-v5");
      await cache.put("/", new Response('<main class="map-screen ev-shell ev-shell-static"></main>', { headers: { "content-type": "text/html" } }));
    });
    const page = await context.newPage();
    try {
      await page.goto(base + "/", { waitUntil: "load" });
      const supported = await page.evaluate(() => "serviceWorker" in navigator && window.isSecureContext);
      if (!supported) {
        console.log("sw: service workers unsupported in this context; migration not exercised");
      } else {
        await page.evaluate(() => navigator.serviceWorker.ready);
        // Give install (precache) and activate (purge) a moment to settle.
        let names = [];
        for (let attempt = 0; attempt < 40; attempt += 1) {
          names = await page.evaluate(() => caches.keys());
          if (names.includes("firepoint-shell-v6") && !names.includes("firepoint-shell-v4")) break;
          await page.waitForTimeout(250);
        }
        check(!names.includes("firepoint-shell-v4") && !names.includes("firepoint-shell-v5"), `sw: old cache survived the update: ${names.join(", ")}`);
        check(names.includes("firepoint-shell-v6"), `sw: new shell cache missing: ${names.join(", ")}`);
        const cachedHome = await page.evaluate(async () => (await (await caches.open("firepoint-shell-v6")).match("/"))?.text() ?? null);
        check(cachedHome !== null && cachedHome.includes("ev-pub-sheet") && !cachedHome.includes("ev-escape-cta"), "sw: cached homepage is not the public shell");
        await context.setOffline(true);
        await page.goto(base + "/", { waitUntil: "domcontentloaded" });
        const offlineHtml = await page.content();
        check(!offlineHtml.includes("ev-escape-cta"), "sw: offline homepage shows the prototype");
        check(offlineHtml.includes("ev-pub-sheet") || offlineHtml.includes("offline"), "sw: offline homepage is neither the public shell nor the offline page");
        await context.setOffline(false);
        console.log(`sw: migration OK — caches now ${names.join(", ")}; offline "/" serves ${offlineHtml.includes("ev-pub-sheet") ? "the public shell" : "the offline page"}`);
      }
    } finally { await context.close(); }
  }
} finally { await browser.close(); }

if (failures.length) {
  console.error("Public release gate smoke FAILED:\n - " + failures.join("\n - "));
  process.exit(1);
}
