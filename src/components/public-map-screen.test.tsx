import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { guideContent } from "@/domain/guide-content";
import { ENGLISH_ONLY_NOTICE, publicScreenLocalized } from "@/domain/public-screen-copy";
import { SAFE_ZONES, SHELTERS } from "@/evacuation/data/glendale";
import { GUIDE_ES } from "@/domain/wildfire-guide.es";
import { GUIDE_HY } from "@/domain/wildfire-guide.hy";
import type { Locale } from "@/i18n/locales";
import Home from "../app/page";
import { PUBLIC_STATUS_BODY, PUBLIC_STATUS_TITLE, PublicMapScreen } from "./public-map-screen";

// The homepage reads the saved language from request cookies; outside a request, use the test's choice.
const request = vi.hoisted(() => ({ locale: "en" as Locale }));
vi.mock("@/i18n/server", () => ({ getLocale: async () => request.locale }));
afterEach(() => { vi.unstubAllEnvs(); request.locale = "en"; });

/** Markup the unverified routing prototype produces and the public screen must never contain. */
const PROTOTYPE_MARKERS = [
  "ev-escape-cta", "Escape", "ev-bar", "ev-sheet", "ev-go", "Nearest shelter", "Escape route", "Go</a>",
  "Allow location access", "Enter address", "Routes start from", "ev-locate", "routes avoid",
  ...SHELTERS.map((shelter) => shelter.name),
  ...SAFE_ZONES.map((zone) => zone.name),
];

describe("public homepage (release gate off)", () => {
  it("renders the basemap shell, private marks and the exact no-data statement", () => {
    const html = renderToStaticMarkup(<PublicMapScreen />);
    expect(html).toMatch(/class="map-screen ev-shell ev-shell-static"/);
    // Without a token the map is replaced by a notice; with one, the client-only map is a placeholder on the server.
    expect(html).toMatch(/Loading map…|Map unavailable: no Mapbox token is configured\./);
    expect(html).toMatch(/<button[^>]*class="fire-token"[^>]*disabled=""/);
    expect(html).toMatch(/<button[^>]*class="fire-token"[^>]*aria-label="[^"]*Marks stay on this device and are not reports\."/);
    expect(html).toContain("Local to this device");
    expect(html).toContain(PUBLIC_STATUS_TITLE);
    expect(html).toContain(PUBLIC_STATUS_BODY);
    expect(PUBLIC_STATUS_TITLE).toBe("No verified incident, shelter or route loaded");
    expect(html).toContain("not an all-clear");
    expect(html).toContain("call 911");
    expect(html).toContain('href="/prepare"');
    expect(html).toContain('href="/prepare#sources-title"');
    expect(html).toMatch(/<a lang="en" class="map-brand" aria-label="Firepoint: official sources and the Ready, Set, Go guide"/);
    expect(html).not.toContain("prep list");
    expect(html).toMatch(/<button[^>]*class="theme-toggle"/);
    expect(html).toContain("lang-select");
  });

  it("shows no shelter, escape, route, Go link or location prompt", () => {
    const html = renderToStaticMarkup(<PublicMapScreen />);
    for (const marker of PROTOTYPE_MARKERS) expect(html, marker).not.toContain(marker);
    expect(html).not.toMatch(/open<\/|"open"|status: open/i);
  });

  it("never imports the routing, shelter, geolocation or directions modules", () => {
    const source = readFileSync("src/components/public-map-screen.tsx", "utf8");
    const imports = [...source.matchAll(/^import[^;]*from\s+"([^"]+)";/gm)].map((match) => match[1]);
    const forbidden = [
      "@/evacuation/route-provider", "@/evacuation/route-planner", "@/evacuation/routing", "@/evacuation/location",
      "@/evacuation/geocode", "@/evacuation/hazards", "@/evacuation/marks", "@/evacuation/data/glendale", "./route-bar",
    ];
    expect(imports.length).toBeGreaterThan(5);
    for (const path of forbidden) expect(imports, path).not.toContain(path);
    expect(source).not.toMatch(/geolocation|watchPosition|getCurrentPosition|LocationTracker|RoutePlanner|getRoute/);
  });
});

describe("public homepage languages", () => {
  const card = (html: string) => html.match(/<section[^>]*class="ev-public-status"[^>]*>[\s\S]*<\/section>/)?.[0] ?? "";

  it("marks its English-only card, mark control and English controls with lang=\"en\" and shows no fallback on English", () => {
    const html = renderToStaticMarkup(<PublicMapScreen locale="en" localized={publicScreenLocalized("en")} />);
    expect(card(html)).toMatch(/^<section[^>]*lang="en"/);
    expect(html).toMatch(/<div lang="en"><div class="map-panel">/);
    expect(html).toMatch(/<button type="button" lang="en" class="theme-toggle"/);
    expect(html).not.toContain(ENGLISH_ONLY_NOTICE);
    expect(html).not.toContain("ev-public-status-localized");
  });

  it.each([["es", GUIDE_ES], ["hy", GUIDE_HY]] as const)("on %s says the status is English only and reuses only existing guide lines", (locale, guide) => {
    const localized = publicScreenLocalized(locale);
    const html = renderToStaticMarkup(<PublicMapScreen locale={locale} localized={localized} />);
    expect(ENGLISH_ONLY_NOTICE).toBe("Map status is available in English only.");
    expect(card(html)).toMatch(/^<section[^>]*lang="en"/);
    expect(html).toContain(`<p class="ev-public-status-english-only">${ENGLISH_ONLY_NOTICE}</p>`);
    // The only non-English text is copied verbatim from that language's existing /prepare guide translation.
    expect(localized).toEqual({ locale, urgentCall: guide.ui.urgentCall, guideTitle: guide.ui.title });
    expect(html).toContain(`<p lang="${locale}" class="ev-public-status-localized"><strong>${guide.ui.urgentCall}</strong> <a href="/prepare">${guide.ui.title}</a></p>`);
    expect(guide.ui.urgentCall).toContain("911");
    // The English statements stay, unchanged, before the localized line's English-only notice.
    expect(html).toContain(PUBLIC_STATUS_TITLE);
    expect(html).toContain(PUBLIC_STATUS_BODY);
    expect(html.indexOf(ENGLISH_ONLY_NOTICE)).toBeLessThan(html.indexOf(PUBLIC_STATUS_TITLE));
    // The language select keeps its own language, outside the English-only regions.
    expect(html).toContain(`aria-label="${guideContent(locale).ui.languageLabel}"`);
  });

  it("serves the fallback from the page for a saved non-English language", async () => {
    vi.stubEnv("NODE_ENV", "production");
    request.locale = "hy";
    const html = renderToStaticMarkup(await Home());
    expect(html).toContain(ENGLISH_ONLY_NOTICE);
    expect(html).toContain(GUIDE_HY.ui.urgentCall);
    expect(html).toContain('<option value="hy" lang="hy" title="Հայերեն" selected="">AM</option>');
  });
});

describe("homepage release gate", () => {
  it("serves the public screen in production even when the prototype flag is set", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("FIREPOINT_PROTOTYPE_ROUTING", "enabled");
    const html = renderToStaticMarkup(await Home());
    expect(html).toContain("ev-shell-static");
    expect(html).toContain(PUBLIC_STATUS_TITLE);
    for (const marker of PROTOTYPE_MARKERS) expect(html, marker).not.toContain(marker);
  });

  it("serves the public screen by default outside production too", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("FIREPOINT_PROTOTYPE_ROUTING", "");
    const html = renderToStaticMarkup(await Home());
    expect(html).toContain("ev-shell-static");
    expect(html).not.toContain("ev-escape-cta");
  });

  it("serves the developer prototype only for a deliberate nonproduction run", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("FIREPOINT_PROTOTYPE_ROUTING", "enabled");
    const html = renderToStaticMarkup(await Home());
    expect(html).not.toContain("ev-shell-static");
    expect(html).toContain("ev-escape-cta");
    expect(html).toContain("Allow location access to see routes from where you are.");
  });
});
