import { describe, expect, it } from "vitest";
import { negotiateLocale, safeReturnPath } from "./locales";

describe("negotiateLocale", () => {
  it("prefers a saved choice over the browser's languages", () => {
    expect(negotiateLocale("hy", "es-MX,es;q=0.9")).toBe("hy");
  });

  it("follows the browser's ranked languages by primary subtag", () => {
    expect(negotiateLocale(undefined, "es-MX,es;q=0.9,en;q=0.8")).toBe("es");
    expect(negotiateLocale(undefined, "fr-FR,hy-AM;q=0.7,en;q=0.5")).toBe("hy");
    expect(negotiateLocale(undefined, "en;q=0.4,es;q=0.9")).toBe("es");
  });

  it("falls back to English for unknown, refused or malformed input", () => {
    expect(negotiateLocale("fr", null)).toBe("en");
    expect(negotiateLocale(undefined, "de,fr;q=0.8")).toBe("en");
    expect(negotiateLocale(undefined, "es;q=0")).toBe("en");
    expect(negotiateLocale(undefined, ";;,=,q")).toBe("en");
  });
});

describe("safeReturnPath", () => {
  it("allows same-site paths only", () => {
    expect(safeReturnPath("/prepare#go")).toBe("/prepare#go");
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "prepare", "", null]) {
      expect(safeReturnPath(bad)).toBe("/prepare");
    }
  });
});
