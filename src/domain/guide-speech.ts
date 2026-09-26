import type { GuideContent } from "./wildfire-guide";
import type { Locale } from "@/i18n/locales";

/*
 * Read-aloud plan for /prepare. Every spoken string is an exact GuideContent string that is already
 * visible on the page, in page order. Nothing here is generated, summarized or hidden: the page text
 * is the transcript. English only, because the Spanish and Armenian translations are unreviewed.
 */

/** One visible block of the guide, spoken as its exact parts, one utterance per part. */
export type SpeechPassage = { readonly section: string; readonly parts: readonly string[] };

/** The only locale whose guide text may be read aloud today. */
export const SPEECH_LOCALE: Locale = "en";
/** BCP 47 tag handed to the browser's speech engine (the guide is US English). */
export const SPEECH_LANG = "en-US";

/** True when read-aloud may be offered for this locale (never for unreviewed translations). */
export function speechAllowed(locale: Locale): locale is typeof SPEECH_LOCALE {
  return locale === SPEECH_LOCALE;
}

/**
 * The guide's visible text, in page order, as exact strings. Returns null for any locale other than
 * English, so a translated page can never be spoken by mistake.
 */
export function guideSpeechPassages(locale: Locale, c: GuideContent): readonly SpeechPassage[] | null {
  if (!speechAllowed(locale)) return null;
  const { ui } = c;
  const passages: SpeechPassage[] = [
    { section: ui.coverKicker, parts: [ui.coverKicker, ...ui.coverTitle, ui.coverDek] },
    { section: ui.emergencyLabel, parts: [ui.urgentCall, ui.urgentNote] },
  ];
  const chapter = (i: 0 | 1 | 2) => {
    const text = c.chapters[i];
    if (text) passages.push({ section: text.word, parts: [text.word, text.topic, text.line] });
  };

  chapter(0);
  passages.push({
    section: ui.defensibleTitle,
    parts: [ui.defensibleTitle, ui.defensibleLede, ui.ringsCaption, ...c.zones.flatMap((zone) => [zone.name, zone.reach, ...zone.items])],
  });
  passages.push({ section: ui.hardenTitle, parts: [ui.quoteEmbers, ui.hardenTitle, ...c.home.flatMap((item) => [item.part, item.tip])] });

  chapter(1);
  passages.push({ section: ui.planTitle, parts: [ui.planTitle, ui.planLede, ...c.plan.flatMap((item) => [item.q, item.a])] });
  passages.push({ section: ui.kitTitle, parts: [ui.kitTitle, ui.kitKicker, ui.kitLede, ...c.kit] });
  passages.push({ section: ui.sixPsTitle, parts: [ui.sixPsTitle, ui.sixPsLede, ...c.sixPs.flatMap((item) => [item.p, item.detail])] });
  passages.push({
    section: ui.beforeLeavingTitle,
    parts: [ui.beforeLeavingTitle, ...c.beforeLeaving.flatMap((group) => [group.title, ...group.items])],
  });

  chapter(2);
  passages.push({
    section: ui.termsTitle,
    parts: [ui.quoteLeaveEarly, ui.termsTitle, ui.termsLedeBefore, "Know Your Zone", ui.termsLedeAfter, ...c.terms.flatMap((item) => [item.term, item.meaning])],
  });
  passages.push({ section: ui.goTitle, parts: [ui.goTitle, ...c.go] });
  passages.push({
    section: ui.trappedTitle,
    parts: [ui.trappedTitle, ui.trappedLede, ...c.trapped.flatMap((group) => [group.title, ...group.items])],
  });
  passages.push({ section: ui.returningTitle, parts: [ui.returningTitle, ...c.returning] });
  passages.push({ section: ui.sourcesTitle, parts: [ui.sourcesLede, ui.footerDisclaimer] });
  return passages;
}

/** Control labels for the English-only read-aloud control. Not part of GuideContent: never translated. */
export const SPEECH_UI_EN = {
  label: "Listen to this guide",
  intro: "English audio, read aloud by this device. The text stays on this page.",
  play: "Play",
  pause: "Pause",
  resume: "Resume",
  stop: "Stop",
  checking: "Checking whether this browser can read aloud…",
  unsupported: "Read-aloud is not available in this browser. Everything is in the text on this page.",
  noEnglishVoice: "This device has no English voice for read-aloud. Everything is in the text on this page.",
  reading: "Reading:",
  paused: "Paused:",
  ended: "Finished reading.",
  failed: "Audio stopped unexpectedly. Everything is in the text on this page.",
} as const;
