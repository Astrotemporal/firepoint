"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { MARKS_KEY, MAX_MARKS, addMark, createMark, moveMark, parseMarks, type FireMark } from "@/domain/fire-marks";
import { ENGLISH_ONLY_NOTICE, type PublicScreenLocalized } from "@/domain/public-screen-copy";
import { LANGUAGE_LABEL, type Locale } from "@/i18n/locales";
import { mapText } from "@/i18n/map";
import { MAPBOX_TOKEN } from "@/lib/mapbox";
import { registerServiceWorker } from "@/lib/service-worker";
import type { MapHandle } from "./evacuation-map";
import { FirePanel } from "./fire-panel";
import { HelpButton } from "./help-dialog";
import { LanguageSelect } from "./language-select";
import { MapTextProvider } from "./map-text";
import { applyTheme, currentTheme, subscribeTheme, type Theme } from "./theme";
import { MoonIcon, SunIcon } from "./theme-icons";

/*
 * The public homepage. Nothing on it is emergency guidance: a basemap, private on-device marks,
 * the theme and language controls, and one plain statement that no verified incident, shelter or
 * route is loaded. It never asks for the device location, never plans a route and never calls the
 * directions provider; that prototype only renders behind the server-side release gate
 * (`src/server/release-gate.ts`). Keep this module free of the routing/shelter/location imports.
 *
 * Language: the controls, fire marks and pins use the existing `src/i18n/map.ts` translations through
 * `MapTextProvider`. The status card and the mark announcements are English only (no translated
 * safety statement exists for them), and the map strings that promise routes (`mapLabel`, `mapFailed`,
 * `noMapToken`, `placed`, `marksOnDevice`) are never used here.
 */

// Mapbox GL touches `window` and WebGL on import, so the map only ever renders in the browser.
const EvacuationMap = dynamic(() => import("./evacuation-map").then((mod) => mod.EvacuationMap), {
  ssr: false,
  loading: () => <div className="ev-map map-loading" role="status">Loading map…</div>,
});

/** Exact public status line; tests and the browser smoke check look for it verbatim. */
export const PUBLIC_STATUS_TITLE = "No verified incident, shelter or route loaded";
export const PUBLIC_STATUS_BODY = "Follow official sources. This is not an all-clear. To report a fire, call 911.";
/** English-only copy for the map region and load failure: neither may promise routes or shelters. */
export const PUBLIC_MAP_LABEL = "Map with your private marks. No live incidents, shelters or routes are shown.";
export const PUBLIC_MAP_FAILED = "The map couldn’t load. Check your connection.";
export const PUBLIC_NO_TOKEN = "Map unavailable: no Mapbox token is configured.";

const NONE: readonly never[] = [];

type PublicMapScreenProps = {
  locale?: Locale;
  /** Existing translated lines for a non-English visit (see `publicScreenLocalized`); null on English. */
  localized?: PublicScreenLocalized | null;
};

export function PublicMapScreen({ locale = "en", localized = null }: PublicMapScreenProps = {}) {
  const t = mapText(locale);
  // <html data-theme> is set before paint by the layout's theme script.
  const theme = useSyncExternalStore<Theme>(subscribeTheme, currentTheme, () => "light");
  const [marks, setMarks] = useState<FireMark[]>([]);
  const [ready, setReady] = useState(false);
  const [canStore, setCanStore] = useState(true);
  const [hint, setHint] = useState<string | null>(null);
  const mapRef = useRef<MapHandle | null>(null);
  const shellRef = useRef<HTMLElement>(null);
  const statusRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let active = true;
    // Read stored marks after hydration, so server HTML and first client render match.
    queueMicrotask(() => {
      if (!active) return;
      try { setMarks(parseMarks(localStorage.getItem(MARKS_KEY))); }
      catch { setCanStore(false); }
      setReady(true);
    });
    return () => { active = false; };
  }, []);
  useEffect(registerServiceWorker, []);
  // On phones the status card overlaps the map's bottom edge; tell the CSS how tall it is.
  useEffect(() => {
    const shell = shellRef.current;
    const status = statusRef.current;
    if (!shell || !status || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => shell.style.setProperty("--ev-public-status-h", `${status.offsetHeight}px`));
    observer.observe(status);
    return () => observer.disconnect();
  }, []);

  const onReady = useCallback((map: MapHandle | null) => { mapRef.current = map; }, []);

  function save(next: FireMark[]) {
    setMarks(next);
    try {
      if (next.length) localStorage.setItem(MARKS_KEY, JSON.stringify(next));
      else localStorage.removeItem(MARKS_KEY);
      setCanStore(true);
    } catch { setCanStore(false); }
  }

  function place(lat: number, lng: number) {
    save(addMark(marks, createMark(lat, lng)));
    // `t.placed` says routes avoid the mark; the public screen has no routes, so this line stays English.
    setHint(marks.length >= MAX_MARKS
      ? t.placedAtLimit(MAX_MARKS)
      : "Private mark placed. It is not a report. Drag to adjust, or select it to remove.");
  }

  // The panel's own fallback line (`t.marksOnDevice`) mentions routes, so always hand it a public one (English).
  const panelHint = hint ?? (ready ? `${marks.length} ${marks.length === 1 ? "mark" : "marks"} on this device · private, not reports` : null);

  return (
    <MapTextProvider locale={locale}>
    <main ref={shellRef} lang={locale} className="map-screen ev-shell ev-shell-static">
      <h1 className="sr-only">{t.screenTitle}</h1>
      <div className="ev-map-area">
        {MAPBOX_TOKEN ? (
          <EvacuationMap
            dark={theme === "dark"} origin={null} hazards={NONE} shelters={NONE} zones={NONE} plan={null}
            centerKey={null} fitKey={null} marks={marks} onReady={onReady}
            ariaLabel={PUBLIC_MAP_LABEL} failedText={PUBLIC_MAP_FAILED}
            onMoveMark={(id, lat, lng) => save(moveMark(marks, id, lat, lng))}
            onRemoveMark={(id) => { save(marks.filter((mark) => mark.id !== id)); setHint(t.markRemoved); }}
          />
        ) : (
          <div lang="en" className="ev-map ev-map-notice" role="status"><p>{PUBLIC_NO_TOKEN}</p></div>
        )}
        <FirePanel
          ready={ready} count={marks.length} hint={panelHint} map={mapRef} onPlace={place} onHint={setHint}
          onClear={() => { save([]); setHint(t.marksCleared); }}
          help={<HelpButton variant="public" />}
        />
        <div className="map-actions">
          <LanguageSelect current={locale} label={LANGUAGE_LABEL[locale]} returnTo="/" className="map-lang-select" />
          <button type="button" className="theme-toggle" onClick={() => applyTheme(theme === "dark" ? "light" : "dark", true)}
            aria-label={theme === "dark" ? t.switchToLight : t.switchToDark} title={theme === "dark" ? t.lightMode : t.darkMode}>
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>
          {/* Named by its visible text: no separate aria-label, so nothing promises a "prep list". */}
          <Link className="map-brand" href="/prepare">
            <span className="brand-mark" aria-hidden="true"><span /></span>
            <span>{t.prepLink} <span aria-hidden="true">↗</span></span>
          </Link>
        </div>
        {!canStore && <p className="map-storage-warning" role="status">{t.storageWarning}</p>}
      </div>
      <section ref={statusRef} lang="en" className="ev-public-status" aria-labelledby="ev-public-status-title">
        {localized && (
          <>
            {/* Lines that already exist in the visitor's language (from the /prepare guide); nothing new is translated here. */}
            <p lang={localized.locale} className="ev-public-status-localized">
              <strong>{localized.urgentCall}</strong> <Link href="/prepare">{localized.guideTitle}</Link>
            </p>
            <p className="ev-public-status-english-only">{ENGLISH_ONLY_NOTICE}</p>
          </>
        )}
        <p id="ev-public-status-title" className="ev-public-status-title" role="status">{PUBLIC_STATUS_TITLE}</p>
        <p className="ev-public-status-body">{PUBLIC_STATUS_BODY}</p>
        <p className="ev-public-status-links">
          <Link href="/prepare#sources-title">Official sources</Link>
          <Link href="/prepare">Ready, Set, Go guide</Link>
        </p>
        <p className="ev-note">
          The flame places a private mark on this device only. Marks are not reports, fire locations or evacuation zones.
        </p>
      </section>
    </main>
    </MapTextProvider>
  );
}
