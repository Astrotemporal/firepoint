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
  });

  it("sends people to named official providers, not guessed internal feeds", () => {
    const html = renderToStaticMarkup(<FirepointHome />);
    expect(html).toContain("public.alertsense.com/SignUp/Default.aspx?regionid=1916");
    expect(html).toContain("glendaleca.gov/government/departments/fire-department/other-links/emergency-preparedness-response/know-your-zone");
    expect(html).toContain("weather.gov/lox/");
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
