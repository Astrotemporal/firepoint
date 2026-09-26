/**
 * Languages Firepoint's resident pages are offered in. Spanish and Eastern Armenian reflect
 * Glendale's largest non-English-speaking communities. Official notices, agency names and
 * evacuation terms are never replaced: translations sit beside the original English.
 */
export const LOCALES = ["en", "es", "hy"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "firepoint.lang";

/** Each language's name, written in that language. */
export const LOCALE_NAMES: Record<Locale, string> = { en: "English", es: "Español", hy: "Հայերեն" };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * Pick a language: an explicit saved choice first, then the browser's Accept-Language order.
 * Only the primary subtag matters ("es-MX" → es, "hy-AM" → hy); unknown or malformed input → English.
 */
export function negotiateLocale(saved: string | undefined, acceptLanguage: string | null | undefined): Locale {
  if (isLocale(saved)) return saved;
  const ranked = (acceptLanguage ?? "")
    .split(",")
    .map((part, index) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = Number(params.find((p) => p.trim().startsWith("q="))?.trim().slice(2) ?? "1");
      return { base: tag.toLowerCase().split("-")[0], q: Number.isFinite(q) ? q : 0, index };
    })
    .filter((entry) => entry.base && entry.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);
  return ranked.map((entry) => entry.base).find(isLocale) ?? DEFAULT_LOCALE;
}

/** Only same-site paths may be returned to after switching language (no open redirects). */
export function safeReturnPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/prepare";
  return value;
}
