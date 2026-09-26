import { LOCALE_NAMES, LOCALES, type Locale } from "@/i18n/locales";

/**
 * Plain links to /api/lang, which saves the choice and returns here. Works without JavaScript
 * and collects nothing. Each name is written in its own language and marked with that language.
 */
export function LanguagePicker({ current, returnTo, label }: { current: Locale; returnTo: string; label: string }) {
  return (
    <nav className="g-langs" aria-label={label}>
      <span className="g-langs-label" aria-hidden="true">{label}</span>
      <ul>
        {LOCALES.map((locale) => (
          <li key={locale}>
            <a href={`/api/lang?to=${locale}&next=${encodeURIComponent(returnTo)}`} lang={locale} hrefLang={locale}
              aria-current={locale === current ? "true" : undefined}>
              {LOCALE_NAMES[locale]}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
