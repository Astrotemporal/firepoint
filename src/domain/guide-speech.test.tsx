import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WildfireGuide } from "@/components/wildfire-guide";
import { guideContent } from "./guide-content";
import { guideSpeechPassages, SPEECH_LANG, SPEECH_UI_EN, speechAllowed } from "./guide-speech";
import { GUIDE_EN } from "./wildfire-guide";

/** Every string anywhere inside the guide content. */
function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

const decode = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

describe("guide read-aloud passages", () => {
  const passages = guideSpeechPassages("en", GUIDE_EN)!;
  const parts = passages.flatMap((passage) => passage.parts);

  it("exist only for English", () => {
    expect(speechAllowed("en")).toBe(true);
    expect(speechAllowed("es")).toBe(false);
    expect(speechAllowed("hy")).toBe(false);
    expect(guideSpeechPassages("es", guideContent("es"))).toBeNull();
    expect(guideSpeechPassages("hy", guideContent("hy"))).toBeNull();
    expect(SPEECH_LANG).toMatch(/^en-/);
  });

  it("speak only exact strings from the guide content, plus the visible 'Know Your Zone' link text", () => {
    const allowed = new Set([...strings(GUIDE_EN), "Know Your Zone"]);
    for (const part of parts) expect(allowed.has(part), part).toBe(true);
    expect(parts.length).toBeGreaterThan(80);
    for (const part of parts) expect(part.trim().length).toBeGreaterThan(0);
  });

  it("match text that is visible on the English page, in page order", () => {
    const text = decode(renderToStaticMarkup(<WildfireGuide locale="en" />));
    let cursor = 0;
    for (const passage of passages) {
      const at = text.indexOf(passage.parts[0]!, cursor);
      expect(at, `${passage.section} appears after the previous passage`).toBeGreaterThanOrEqual(cursor);
      cursor = at;
      for (const part of passage.parts) expect(text, part).toContain(part);
    }
  });

  it("carry the 911 line, the not-an-alert-system note and the disclaimer", () => {
    expect(parts).toContain(GUIDE_EN.ui.urgentCall);
    expect(parts).toContain(GUIDE_EN.ui.urgentNote);
    expect(parts).toContain(GUIDE_EN.ui.footerDisclaimer);
    for (const term of GUIDE_EN.terms) { expect(parts).toContain(term.term); expect(parts).toContain(term.meaning); }
  });

  it("never invent an all-clear or a safety verdict", () => {
    for (const part of parts) expect(part).not.toMatch(/all[- ]clear(?! information)|you are safe/i);
    for (const label of Object.values(SPEECH_UI_EN)) expect(label).not.toMatch(/all[- ]clear|safe/i);
  });
});
