import { describe, expect, it } from "vitest";
import { guideContent } from "./guide-content";
import { GUIDE_EN, SIX_PS } from "./wildfire-guide";

/** Collect [path, value] for every leaf, so translations can be compared item for item. */
function leaves(value: unknown, path = ""): [string, unknown][] {
  if (Array.isArray(value)) return value.flatMap((item, i) => leaves(item, `${path}[${i}]`));
  if (value && typeof value === "object") return Object.entries(value).flatMap(([key, item]) => leaves(item, `${path}.${key}`));
  return [[path, value]];
}

describe.each(["es", "hy"] as const)("%s guide translation", (locale) => {
  const guide = guideContent(locale);
  const english = new Map(leaves(GUIDE_EN));

  it("has exactly the same sections and list lengths as English", () => {
    expect(leaves(guide).map(([path]) => path)).toEqual([...english.keys()]);
  });

  it("fills in every string, except the notices that only translations use", () => {
    const optionalInEnglish = new Set([".ui.translationNotice", ".ui.readInEnglish", ".ui.officialTerm"]);
    for (const [path, value] of leaves(guide)) {
      expect(typeof value, path).toBe("string");
      expect((value as string).trim().length, path).toBeGreaterThan(0);
      if (!optionalInEnglish.has(path) && !/\.reach$|\.sources\./.test(path)) {
        expect(value, `${path} looks untranslated`).not.toBe(english.get(path));
      }
    }
  });

  it("keeps 911 wherever English tells people to call it", () => {
    for (const [path, value] of leaves(GUIDE_EN)) {
      if (typeof value === "string" && value.includes("911")) {
        expect(leaves(guide).find(([p]) => p === path)?.[1], path).toContain("911");
      }
    }
  });

  it("keeps the English six P's so the mnemonic still works", () => {
    guide.sixPs.forEach((item, i) => expect(item.p.startsWith(SIX_PS[i]!.p)).toBe(true));
  });

  it("says it is unofficial and offers the English version", () => {
    expect(guide.ui.translationNotice.length).toBeGreaterThan(40);
    expect(guide.ui.readInEnglish.length).toBeGreaterThan(0);
  });
});

describe("Armenian guide", () => {
  it("is written in Armenian script with the Armenian full stop", () => {
    const hy = guideContent("hy");
    expect(hy.ui.coverDek).toMatch(/[Ա-֏]/);
    expect(hy.ui.coverDek).toContain("։");
  });
});
