import type { Locale } from "@/i18n/locales";
import { GUIDE_EN, type GuideContent } from "./wildfire-guide";
import { GUIDE_ES } from "./wildfire-guide.es";
import { GUIDE_HY } from "./wildfire-guide.hy";

const GUIDES: Record<Locale, GuideContent> = { en: GUIDE_EN, es: GUIDE_ES, hy: GUIDE_HY };

/** The /prepare guide text in one language. */
export function guideContent(locale: Locale): GuideContent {
  return GUIDES[locale];
}
