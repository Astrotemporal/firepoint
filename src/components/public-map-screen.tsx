"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { MARKS_KEY, MAX_MARKS, addMark, createMark, moveMark, parseMarks, type FireMark } from "@/domain/fire-marks";
import { LANGUAGE_LABEL, type Locale } from "@/i18n/locales";
import { MAPBOX_TOKEN } from "@/lib/mapbox";
import { registerServiceWorker } from "@/lib/service-worker";
import type { MapHandle } from "./evacuation-map";
import { FirePanel } from "./fire-panel";
import { LanguageSelect } from "./language-select";
import { applyTheme, currentTheme, subscribeTheme, type Theme } from "./theme";
import { MoonIcon, SunIcon } from "./theme-icons";

/*
 * The public homepage. Nothing on it is emergency guidance: a basemap, private on-device marks,
 * the theme and language controls, and one plain statement that no verified incident, shelter or
 * route is loaded. It never asks for the device location, never plans a route and never calls the
 * directions provider; that prototype only renders behind the server-side release gate
 * (`src/server/release-gate.ts`). Keep this module free of the routing/shelter/location imports.
 */

// Mapbox GL touches `window` and WebGL on import, so the map only ever renders in the browser.
const EvacuationMap = dynamic(() => import("./evacuation-map").then((mod) => mod.EvacuationMap), {
  ssr: false,
  loading: () => <div className="ev-map map-loading" role="status">Loading map…</div>,
});

/** Exact public status line; tests and the browser smoke check look for it verbatim. */
export const PUBLIC_STATUS_TITLE = "No verified incident, shelter or route loaded";
export const PUBLIC_STATUS_BODY = "Follow official sources. This is not an all-clear. To report a fire, call 911.";

const NONE: readonly never[] = [];
const MAP_LABEL = "Map with your private marks. No live incidents, shelters or routes are shown.";

export function PublicMapScreen({ locale = "en" }: { locale?: Locale } = {}) {
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
    setHint(marks.length >= MAX_MARKS
      ? `Placed. Only the newest ${MAX_MARKS} marks are kept.`
      : "Private mark placed. It is not a report. Drag to adjust, or select it to remove.");
  }

  // The panel's own fallback line describes the routing prototype, so always hand it a public one.
  const panelHint = hint ?? (ready ? `${marks.length} ${marks.length === 1 ? "mark" : "marks"} on this device · private, not reports` : null);

  return (
    <main ref={shellRef} className="map-screen ev-shell ev-shell-static">
      <h1 className="sr-only">Firepoint map</h1>
      <div className="ev-map-area">
        {MAPBOX_TOKEN ? (
          <EvacuationMap
            dark={theme === "dark"} origin={null} hazards={NONE} shelters={NONE} zones={NONE} plan={null}
            centerKey={null} fitKey={null} marks={marks} onReady={onReady} ariaLabel={MAP_LABEL}
            onMoveMark={(id, lat, lng) => save(moveMark(marks, id, lat, lng))}
            onRemoveMark={(id) => { save(marks.filter((mark) => mark.id !== id)); setHint("Mark removed."); }}
          />
        ) : (
          <div className="ev-map ev-map-notice" role="status"><p>Map unavailable: no Mapbox token is configured.</p></div>
        )}
        <FirePanel
          ready={ready} count={marks.length} hint={panelHint} map={mapRef} onPlace={place} onHint={setHint}
          onClear={() => { save([]); setHint("All marks cleared."); }}
        />
        <div className="map-actions">
          <LanguageSelect current={locale} label={LANGUAGE_LABEL[locale]} returnTo="/" className="map-lang-select" />
          <button type="button" className="theme-toggle" onClick={() => applyTheme(theme === "dark" ? "light" : "dark", true)}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} title={theme === "dark" ? "Light mode" : "Dark mode"}>
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>
          <Link className="map-brand" href="/prepare" aria-label="Firepoint: official sources and prep list">
            <span className="brand-mark" aria-hidden="true"><span /></span>
            <span>Official sources &amp; prep <span aria-hidden="true">↗</span></span>
          </Link>
        </div>
        {!canStore && <p className="map-storage-warning" role="status">Browser storage is unavailable. Marks may be lost when you leave this page.</p>}
      </div>
      <section ref={statusRef} className="ev-public-status" aria-labelledby="ev-public-status-title">
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
  );
}
