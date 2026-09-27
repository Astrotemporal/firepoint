import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { formatDuration, formatMiles, formatShortDistance } from "@/evacuation/format";
import { markLabel } from "@/evacuation/marks";
import { createMapboxDirectionsProvider } from "@/evacuation/route-provider";
import type { Hazard } from "@/evacuation/types";
import { MapScreen } from "@/components/map-screen";
import { hazardName } from "@/components/map-text";
import { DIRECTIONS_LANGUAGE, mapText } from "./map";

const EN = mapText("en");

/** Every [path, value] leaf; functions are called with recognizable sample arguments. */
function leaves(value: unknown, path = ""): [string, unknown][] {
  if (typeof value === "function") {
    // Numeric parameters (count, max, n) get a number; everything else a recognizable marker.
    const params = /^\(?([^)=]*)\)?\s*=>/.exec(String(value))?.[1]?.split(",").map((p) => p.trim()) ?? [];
    const args = Array.from({ length: value.length }, (_, i) => (["count", "max", "n"].includes(params[i] ?? "") ? 7 : `«ARG${i}»`));
    return [[`${path}()`, value(...args)]];
  }
  if (value && typeof value === "object") return Object.entries(value).flatMap(([key, item]) => leaves(item, `${path}.${key}`));
  return [[path, value]];
}

describe.each(["es", "hy"] as const)("%s map text", (locale) => {
  const text = mapText(locale);
  const english = new Map(leaves(EN));

  it("has every entry English has", () => {
    expect(leaves(text).map(([path]) => path)).toEqual([...english.keys()]);
  });

  it("fills every entry, keeps each inserted value, and keeps 911", () => {
    // Short codes that may legitimately match English.
    const same = new Set([".northLetter", ".units.mi", ".units.min", ".units.h", ".no"]);
    for (const [path, value] of leaves(text)) {
      expect(typeof value, path).toBe("string");
      expect((value as string).trim().length, path).toBeGreaterThan(0);
      if (!same.has(path)) expect(value, `${path} looks untranslated`).not.toBe(english.get(path));
      for (const arg of String(english.get(path)).match(/«ARG\d»/g) ?? []) expect(value, path).toContain(arg);
      if (String(english.get(path)).includes("911")) expect(value, path).toContain("911");
    }
  });

  it("does not claim a private mark changes routes", () => {
    expect(text.placed).not.toMatch(/rutas.*evitan|ճանապարհներն.*շրջանց/iu);
    expect(text.marksOnDevice(3)).not.toMatch(/rutas.*evitan|ճանապարհները.*շրջանց/iu);
  });

  it("renders the map screen in this language", () => {
    const html = renderToStaticMarkup(<MapScreen locale={locale} />);
    expect(html).toContain(text.loadingMap);
    expect(html).toContain(text.escape);
    expect(html).toContain(text.prepLink);
    expect(html).not.toContain(">Escape<");
    expect(html).not.toContain("Official sources &amp; prep");
  });
});

describe("map text helpers", () => {
  const mark: Hazard = { id: "m", type: "fire", center: { lat: 34.1, lng: -118.2 }, radiusMeters: 100, severity: 3, label: markLabel(1), simulated: false, userMark: true };
  const feed: Hazard = { ...mark, userMark: false, label: "SYNTHETIC FEED LABEL" };

  it("translates a person's own fire marks but never a feed's hazard label", () => {
    expect(hazardName(mark, mapText("es"))).toBe("Marca de incendio 2");
    expect(hazardName(mark, mapText("hy"))).toBe("Հրդեհի նշում 2");
    expect(hazardName(feed, mapText("es"))).toBe("SYNTHETIC FEED LABEL");
  });

  it("formats distances and times with each language's units, English by default", () => {
    expect(formatMiles(3218.7)).toBe("2.0 mi");
    expect(formatDuration(3900, mapText("hy").units)).toBe("1 ժ 5 ր");
    expect(formatShortDistance(30, mapText("es").units)).toBe("100 pies");
  });

  it("asks Mapbox for Spanish road steps, and English for Armenian (unsupported)", async () => {
    expect(DIRECTIONS_LANGUAGE).toEqual({ en: "en", es: "es", hy: "en" });
    let body = "";
    const provider = createMapboxDirectionsProvider({
      token: "pk.synthetic", language: "es",
      fetcher: async (_url, init) => { body = String(init?.body); return new Response("{}", { status: 500 }); },
    });
    await provider({ lat: 34.1, lng: -118.2 }, { lat: 34.2, lng: -118.3 }).catch(() => undefined);
    expect(new URLSearchParams(body).get("language")).toBe("es");
  });
});
