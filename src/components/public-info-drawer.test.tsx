import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  EVAC_UNAVAILABLE,
  NOT_ALL_CLEAR,
  SHELTER_UNAVAILABLE,
  PublicInfoDrawer,
  type VerifiedNoticeSnapshot,
  type VerifiedShelterSnapshot,
} from "./public-info-drawer";

// ---------------------------------------------------------------------------
// Safety: classes and strings the routing prototype uses that must never
// appear in the public drawer.
// ---------------------------------------------------------------------------
const ROUTING_MARKERS = [
  "ev-escape-cta", "ev-bar", "ev-sheet", "ev-go",
  "Nearest shelter", "Escape route", "Go</a>",
  "Allow location access", "Use my location", "ev-ask-button",
  "Enter address", "Routes start from", "ev-locate",
  "FEMA National Shelter System",  // never claim a live FEMA connection in UI
];

describe("PublicInfoDrawer empty states", () => {
  it("renders the drawer handle and peek rows", () => {
    const html = renderToStaticMarkup(<PublicInfoDrawer />);
    expect(html).toContain("ev-pub-sheet");
    expect(html).toContain("ev-pub-handle");
    expect(html).toContain("ev-pub-peek");
    expect(html).toContain("ev-pub-body");
  });

  it("shows the shelter unavailable string verbatim", () => {
    const html = renderToStaticMarkup(<PublicInfoDrawer />);
    expect(html).toContain(SHELTER_UNAVAILABLE);
    expect(SHELTER_UNAVAILABLE).toBe(
      "Shelter status unavailable — no verified open-shelter feed loaded",
    );
  });

  it("shows the evac unavailable string verbatim", () => {
    const html = renderToStaticMarkup(<PublicInfoDrawer />);
    expect(html).toContain(EVAC_UNAVAILABLE);
    expect(EVAC_UNAVAILABLE).toBe(
      "Evacuation status unavailable — check issuing agency",
    );
  });

  it("shows the not-all-clear notice", () => {
    const html = renderToStaticMarkup(<PublicInfoDrawer />);
    expect(html).toContain(NOT_ALL_CLEAR);
    expect(NOT_ALL_CLEAR).toContain("not an all-clear");
    expect(NOT_ALL_CLEAR).toContain("911");
  });

  it("includes links to the prepare page and the sources section", () => {
    const html = renderToStaticMarkup(<PublicInfoDrawer />);
    expect(html).toContain('href="/prepare#sources-title"');
    expect(html).toContain('href="/prepare"');
    expect(html).toContain("Official sources");
    expect(html).toContain("Ready, Set, Go guide");
  });

  it("includes the private-mark disclaimer", () => {
    const html = renderToStaticMarkup(<PublicInfoDrawer />);
    expect(html).toContain("private mark on this device only");
    expect(html).toContain("not reports, fire locations or evacuation zones");
  });

  it("carries no routing, escape, geolocation, or shelter markers", () => {
    const html = renderToStaticMarkup(<PublicInfoDrawer />);
    for (const marker of ROUTING_MARKERS) {
      expect(html, marker).not.toContain(marker);
    }
  });

  it("never claims a status is safe or all-clear", () => {
    const html = renderToStaticMarkup(<PublicInfoDrawer />);
    expect(html).not.toMatch(/safe to return|evacuations? (lifted|ended|over)|return is safe|status: ?(clear|safe|ok)/i);
  });

  it("renders in lang=en and has the section role", () => {
    const html = renderToStaticMarkup(<PublicInfoDrawer />);
    expect(html).toMatch(/lang="en"/);
    // section element carries aria-label, not aria-labelledby pointing at routing content
    expect(html).toContain('aria-label="Status and official sources"');
  });
});

describe("PublicInfoDrawer with future verified-snapshot slots (synthetic fixtures, tests only)", () => {
  const fakeShelter: VerifiedShelterSnapshot = {
    source: "TEST-NSS",
    sourceUrl: "https://example.test/shelters",
    issuer: "TEST Agency",
    fetchedAt: "2099-01-01T00:00:00Z",
    coverage: "Test County",
    openCount: 3,
  };

  const fakeShelterZero: VerifiedShelterSnapshot = {
    ...fakeShelter,
    openCount: 0,
  };

  const fakeNotice: VerifiedNoticeSnapshot = {
    source: "TEST-OES",
    sourceUrl: "https://example.test/notices",
    issuer: "TEST OES",
    issuedAt: "2099-01-01T00:00:00Z",
    fetchedAt: "2099-01-01T00:01:00Z",
    jurisdiction: "Test City",
    orderCount: 1,
    warningCount: 2,
  };

  it("shows shelter count when snapshot provided", () => {
    const html = renderToStaticMarkup(<PublicInfoDrawer shelterSnapshot={fakeShelter} />);
    expect(html).not.toContain(SHELTER_UNAVAILABLE);
    expect(html).toContain("3 shelters listed");
    expect(html).toContain("TEST Agency");
  });

  it("shows 'zero is not all-clear' when snapshot shows 0 open shelters", () => {
    const html = renderToStaticMarkup(<PublicInfoDrawer shelterSnapshot={fakeShelterZero} />);
    expect(html).not.toContain(SHELTER_UNAVAILABLE);
    expect(html).toContain("0 shelters listed");
    expect(html).toContain("zero is not all-clear");
    // Must not imply safety — "zero is not all-clear" is safe phrasing, check for positive safety claims only
    expect(html).not.toMatch(/safe to return|evacuations? (lifted|ended|over)|return is safe/i);
  });

  it("shows notice count when snapshot provided", () => {
    const html = renderToStaticMarkup(<PublicInfoDrawer noticeSnapshot={fakeNotice} />);
    expect(html).not.toContain(EVAC_UNAVAILABLE);
    expect(html).toContain("1 order");
    expect(html).toContain("2 warnings");
    expect(html).toContain("TEST OES");
  });

  it("always shows not-all-clear even with verified snapshots", () => {
    const html = renderToStaticMarkup(
      <PublicInfoDrawer shelterSnapshot={fakeShelter} noticeSnapshot={fakeNotice} />,
    );
    expect(html).toContain(NOT_ALL_CLEAR);
  });

  it("shows source attribution note in body when snapshot provided", () => {
    const html = renderToStaticMarkup(<PublicInfoDrawer shelterSnapshot={fakeShelter} />);
    expect(html).toContain("TEST-NSS");
    expect(html).toContain("2099-01-01T00:00:00Z");
  });
});

describe("PublicInfoDrawer language", () => {
  it("renders the localized urgentCall and guideTitle when localized supplied", () => {
    const localized = {
      locale: "es" as const,
      urgentCall: "¿Está en peligro? Llame al 911.",
      guideTitle: "Guía Listo, Preparado, ¡Vámonos!",
    };
    const html = renderToStaticMarkup(<PublicInfoDrawer localized={localized} />);
    expect(html).toContain("¿Está en peligro? Llame al 911.");
    expect(html).toContain("Guía Listo, Preparado, ¡Vámonos!");
    expect(html).toContain("Map status is available in English only.");
    // lang attribute on localized paragraph
    expect(html).toContain('lang="es"');
  });

  it("shows no localized block and no english-only notice on English", () => {
    const html = renderToStaticMarkup(<PublicInfoDrawer localized={null} />);
    expect(html).not.toContain("ev-public-status-localized");
    expect(html).not.toContain("Map status is available in English only.");
  });
});