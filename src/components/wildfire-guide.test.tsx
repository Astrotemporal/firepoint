import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, readFileSync } from "node:fs";
import { WildfireGuide } from "./wildfire-guide";
import { GO, KIT, PHOTOS, SIX_PS, SOURCES, TERMS, TRAPPED } from "@/domain/wildfire-guide";
import { guideContent } from "@/domain/guide-content";
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

describe("early original-source links in English only", () => {
  const page = renderToStaticMarkup(<WildfireGuide locale="en" />);
  const start = page.indexOf('class="g-source-shortcuts g-card"');
  const section = page.slice(start, page.indexOf('class="g-cover"'));

  it("places independent, non-live notice and external-link caveat before the guide", () => {
    expect(start).toBeGreaterThan(-1);
    expect(start).toBeLessThan(page.indexOf('class="g-photo g-photo-cover"'));
    expect(section).toContain(guideContent("en").ui.footerDisclaimer);
    expect(section).toContain("may fail offline");
    expect(section).toContain("coverage or jurisdiction for your location");
    expect(section).toContain("does not check current orders or status");
    expect(section).toContain("does not look up your evacuation zone");
    expect(section).toContain("do not imply a partnership");
    expect(section).not.toContain(guideContent("en").ui.sourcesLede);
    expect(section).not.toMatch(/last checked|last updated|checked at|checked on/i);
  });

  it("links each original publisher directly with safe new-tab attributes", () => {
    for (const source of [SOURCES.county, SOURCES.nws, SOURCES.rsg]) {
      expect(section).toContain(`<a href="${source.url}" target="_blank" rel="noopener noreferrer">`);
    }
    expect(section).not.toContain(SOURCES.genasys.url.replaceAll("&", "&amp;"));
    expect(section).not.toContain("<form");
  });
});

describe.each(["es", "hy"] as const)("no unreviewed early shortcut card in %s", (locale) => {
  const page = renderToStaticMarkup(<WildfireGuide locale={locale} />);

  it("keeps the existing translation notice and guide links but no English-only card", () => {
    expect(page).not.toContain('class="g-source-shortcuts g-card"');
    expect(page).not.toContain("These links open external publishers");
    expect(page.indexOf(guideContent(locale).ui.translationNotice)).toBeLessThan(page.indexOf('class="g-photo g-photo-cover"'));
    expect(page).toContain(SOURCES.county.url);
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
