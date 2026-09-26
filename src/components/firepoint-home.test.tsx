import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { FirepointHome } from "./firepoint-home";
import manifest from "../app/manifest";

describe("Firepoint home safety states", () => {
  it("renders unknown live status and zone without an all-clear", () => {
    const html = renderToStaticMarkup(<FirepointHome />);
    expect(html).toContain("NOT CHECKED");
    expect(html).toContain("NOT LOOKED UP");
    expect(html).toContain("not an all-clear");
    expect(html).toContain("Approximate neighborhood name only");
    expect(html).toContain("Live source checks are paused");
    expect(html).not.toContain("Check central Glendale");
  });

  it("offers live source checks only on request, and says what they do not cover", () => {
    const html = renderToStaticMarkup(<FirepointHome demoLiveSources />);
    expect(html).toContain("Check central Glendale");
    expect(html).toContain("Use my location once");
    expect(html).toContain("does not check evacuation orders");
    expect(html).not.toContain("status-ok");
  });

  it("sends people to named official providers, not guessed internal feeds", () => {
    const html = renderToStaticMarkup(<FirepointHome />);
    expect(html).toContain("glendaleca.gov/government/departments/fire-department/other/emergency-preparedness-response/city-wide-emergency-communications");
    expect(html).not.toContain("public.alertsense.com");
    expect(html).toContain("glendaleca.gov/government/departments/fire-department/other-links/emergency-preparedness-response/know-your-zone");
    expect(html).toContain("weather.gov/lox/");
  });

  it("shows Ready, Set, Go fire guidance with the go-bag list first", () => {
    const html = renderToStaticMarkup(<FirepointHome />);
    expect(html).toContain('role="tablist"');
    expect(html).toContain(">Ready<");
    expect(html).toContain(">Set<");
    expect(html).toContain(">Go<");
    expect(html).toContain("N95 masks");
    expect(html).toContain("Write down important phone numbers");
    expect(html).toContain("readyforwildfire.org/prepare-for-wildfire/emergency-supply-kit/");
    expect(html).toContain("Call 911");
  });

  it("provides an offline-only checklist fallback without caching live responses", () => {
    const sw = readFileSync("public/sw.js", "utf8");
    const offline = readFileSync("public/offline.html", "utf8");
    expect(manifest().display).toBe("standalone");
    expect(sw).toContain('url.pathname.startsWith("/api/")');
    expect(sw).toContain('caches.match("/offline.html")');
    expect(offline).toContain("firepoint.prep.v1");
    expect(offline).toContain("not checked");
  });
});
