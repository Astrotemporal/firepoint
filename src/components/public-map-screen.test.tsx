import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SAFE_ZONES, SHELTERS } from "@/evacuation/data/glendale";
import Home from "../app/page";
import { PUBLIC_STATUS_BODY, PUBLIC_STATUS_TITLE, PublicMapScreen } from "./public-map-screen";

// The homepage reads the saved language from request cookies; outside a request, use English.
vi.mock("@/i18n/server", () => ({ getLocale: async () => "en" }));
afterEach(() => vi.unstubAllEnvs());

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
