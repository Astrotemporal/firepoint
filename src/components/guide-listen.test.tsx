import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { GuideListen } from "./guide-listen";
import { WildfireGuide } from "./wildfire-guide";
import { GUIDE_EN } from "@/domain/wildfire-guide";
import { guideSpeechPassages, SPEECH_UI_EN } from "@/domain/guide-speech";

const passages = guideSpeechPassages("en", GUIDE_EN)!;

describe("listen control", () => {
  const html = renderToStaticMarkup(<GuideListen locale="en" passages={passages} />);

  it("renders as a labelled group of plain buttons that do nothing before hydration", () => {
    expect(html).toContain(`aria-label="${SPEECH_UI_EN.label}"`);
    expect(html).toContain('lang="en"');
    expect(html).toContain('type="button"');
    expect(html).toContain("disabled");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<audio");
    expect(html).not.toContain("autoplay");
    expect(html).toContain(SPEECH_UI_EN.checking);
  });

  it("refuses every locale except English, even if handed passages", () => {
    expect(renderToStaticMarkup(<GuideListen locale="es" passages={passages} />)).toBe("");
    expect(renderToStaticMarkup(<GuideListen locale="hy" passages={passages} />)).toBe("");
  });

  it("only appears on the English guide; translated pages are unchanged", () => {
    expect(renderToStaticMarkup(<WildfireGuide locale="en" />)).toContain(SPEECH_UI_EN.label);
    for (const locale of ["es", "hy"] as const) {
      const page = renderToStaticMarkup(<WildfireGuide locale={locale} />);
      expect(page).not.toContain(SPEECH_UI_EN.label);
      expect(page).not.toContain("g-listen");
    }
  });

  it("uses no network, server route, microphone or navigation", () => {
    const source = readFileSync("src/components/guide-listen.tsx", "utf8") + readFileSync("src/lib/guide-reader.ts", "utf8");
    for (const banned of ["fetch(", "XMLHttpRequest", "/api/", "getUserMedia", "SpeechRecognition", "location.assign", "router.push", "elevenlabs"]) {
      expect(source.toLowerCase()).not.toContain(banned.toLowerCase());
    }
    expect(source).toContain('window.addEventListener("pagehide", stop)');
    // The UI can only obtain a reader through the fail-closed opener, and must not build one itself.
    expect(readFileSync("src/components/guide-listen.tsx", "utf8")).toContain("openGuideReader(");
    expect(readFileSync("src/components/guide-listen.tsx", "utf8")).not.toContain("createGuideReader");
  });
});
