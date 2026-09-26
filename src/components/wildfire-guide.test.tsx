import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, readFileSync } from "node:fs";
import { WildfireGuide } from "./wildfire-guide";
import { GO, KIT, PHOTOS, SIX_PS, SOURCES, TERMS, TRAPPED } from "@/domain/wildfire-guide";
import manifest from "../app/manifest";

const html = renderToStaticMarkup(<WildfireGuide />);
const text = html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&");

describe("wildfire guide page", () => {
  it("reads as a Ready, Set, Go guide from the fire department", () => {
    expect(html).toContain('id="ready"');
    expect(html).toContain('id="set"');
    expect(html).toContain('id="go"');
    expect(html).toContain(SOURCES.rsg.url);
    expect(html).toContain(SOURCES.brochure.url);
    for (const { p } of SIX_PS) expect(text).toContain(p);
    for (const item of KIT) expect(text).toContain(item);
  });

  it("puts 911 and the not-an-alert-system note before the guide", () => {
    const call = html.indexOf("Call 911");
    expect(call).toBeGreaterThan(-1);
    expect(call).toBeLessThan(html.indexOf('id="ready"'));
    expect(text).toMatch(/not an alert system/i);
  });

  it("quotes official evacuation terms with their source and links to the zone lookup", () => {
    for (const { term } of TERMS) expect(text).toContain(term);
    expect(html).toContain(SOURCES.terms.url);
    expect(html).toContain(SOURCES.zone.url);
    expect(html).toContain(SOURCES.genasys.url.replaceAll("&", "&amp;"));
    expect(text).toContain("centered on Glendale");
    expect(text).toContain("not a Firepoint zone lookup");
    expect(html).toContain(SOURCES.alerts.url);
  });

  it("keeps the unreviewed English Genasys caution out of translated source lists", () => {
    for (const locale of ["es", "hy"] as const) {
      const localized = renderToStaticMarkup(<WildfireGuide locale={locale} />);
      expect(localized).not.toContain(SOURCES.genasys.url.replaceAll("&", "&amp;"));
      expect(localized).toContain(SOURCES.zone.url);
    }
  });

  it("shows each photo with alt text and a public-domain credit link", () => {
    for (const photo of Object.values(PHOTOS)) {
      expect(existsSync(`public${photo.src}`)).toBe(true);
      expect(html).toContain(`alt="${photo.alt}"`);
      expect(html).toContain(photo.url);
    }
  });

  it("is informational only: no checkboxes, forms, or live source checks", () => {
    expect(html).not.toContain('type="checkbox"');
    expect(html).not.toContain("<form");
    expect(html).not.toContain("Check central Glendale");
    expect(text).not.toMatch(/all[- ]clear(?! information)|you are safe/i);
  });
});

describe.each(["es", "hy"] as const)("wildfire guide in %s", (locale) => {
  const page = renderToStaticMarkup(<WildfireGuide locale={locale} />);

  it("marks the page language and says the translation is unofficial", () => {
    expect(page).toContain(`lang="${locale}"`);
    expect(page).toContain('role="note"');
    expect(page).toContain("/api/lang?to=en&amp;next=%2Fprepare");
  });

  it("still puts 911 before the guide and shows each official English term", () => {
    const call = page.indexOf("911");
    expect(call).toBeGreaterThan(-1);
    expect(call).toBeLessThan(page.indexOf('id="ready"'));
    for (const { term } of TERMS) expect(page).toContain(`<span lang="en">${term}</span>`);
  });

  it("keeps every official link and photo, with translated alt text", () => {
    for (const source of [SOURCES.zone, SOURCES.alerts, SOURCES.terms, SOURCES.rsg, SOURCES.brochure]) expect(page).toContain(source.url);
    for (const photo of Object.values(PHOTOS)) {
      expect(page).toContain(photo.url);
      expect(page).not.toContain(`alt="${photo.alt}"`);
    }
    expect(page).not.toContain("<form");
  });
});

describe("offline fallback", () => {
  const offline = readFileSync("public/offline.html", "utf8");

  it("carries the leaving steps, trapped steps and supply kit", () => {
    for (const step of GO) expect(offline).toContain(step);
    for (const group of TRAPPED) for (const item of group.items) expect(offline).toContain(item);
    for (const item of KIT) expect(offline).toContain(item);
  });

  it("stays a static page that caches nothing live", () => {
    const sw = readFileSync("public/sw.js", "utf8");
    expect(manifest().display).toBe("standalone");
    expect(sw).toContain('url.pathname.startsWith("/api/")');
    expect(sw).toContain('caches.match("/offline.html")');
    expect(offline).toContain("not checked");
    expect(offline).toContain(SOURCES.genasys.url.replaceAll("&", "&amp;"));
    expect(offline).toContain("It is not a Firepoint zone lookup");
    expect(offline).not.toContain('type="checkbox"');
  });
});
