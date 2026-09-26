"use client";

import { LOCALE_CODES, LOCALE_NAMES, LOCALES, isLocale, type Locale } from "@/i18n/locales";

const switchUrl = (locale: Locale, returnTo: string) => `/api/lang?to=${locale}&next=${encodeURIComponent(returnTo)}`;

/**
 * Compact EN / ES / AM language select for the top-right corner of every screen. Choosing a
 * language goes through /api/lang, which saves it and returns to this page. Without JavaScript,
 * the same choices appear as plain links.
 */
export function LanguageSelect({ current, label, returnTo, className }: { current: Locale; label: string; returnTo: string; className?: string }) {
  return (
    <>
      <select
        className={`lang-select${className ? ` ${className}` : ""}`}
        aria-label={label}
        title={label}
        value={current}
        onChange={(event) => {
          const next = event.target.value;
          if (isLocale(next)) window.location.assign(switchUrl(next, `${location.pathname}${location.hash}`));
        }}
      >
        {LOCALES.map((locale) => (
          <option key={locale} value={locale} lang={locale} title={LOCALE_NAMES[locale]}>{LOCALE_CODES[locale]}</option>
        ))}
      </select>
      <noscript>
        <span className="lang-noscript">
          {LOCALES.map((locale) => (
            <a key={locale} href={switchUrl(locale, returnTo)} lang={locale} hrefLang={locale}>{LOCALE_NAMES[locale]}</a>
          ))}
        </span>
      </noscript>
    </>
  );
}
