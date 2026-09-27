import { guideContent } from "./guide-content";
import type { Locale } from "@/i18n/locales";

/*
 * Language handling for the public homepage. Its status card, controls and mark copy are written in
 * English only; no Spanish or Armenian version of those safety statements has been written or reviewed,
 * so none is invented here. On a non-English visit the card says so, in English, and repeats two lines
 * that already exist in the visitor's language in the reviewed-shape /prepare guide translations
 * (the 911 line and the guide's name), without adding any new translated text.
 */

/** Exact English-only notice; tests and the browser smoke check look for it verbatim. */
export const ENGLISH_ONLY_NOTICE = "Map status is available in English only.";

export type PublicScreenLocalized = {
  locale: Exclude<Locale, "en">;
  /** The guide's existing "Are you in danger? Call 911." line, in the visitor's language. */
  urgentCall: string;
  /** The guide's existing name in the visitor's language; links to /prepare, which renders in that language. */
  guideTitle: string;
};

/** `null` for English; otherwise the existing translated lines the public card may show beside its English text. */
export function publicScreenLocalized(locale: Locale): PublicScreenLocalized | null {
  if (locale === "en") return null;
  const { ui } = guideContent(locale);
  return { locale, urgentCall: ui.urgentCall, guideTitle: ui.title };
}
