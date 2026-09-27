"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { MARKS_KEY, MAX_MARKS, addMark, createMark, moveMark, parseMarks, type FireMark } from "@/domain/fire-marks";
import { GLENDALE_CITY_HALL, SAFE_ZONES, SERVICE_RADIUS_METERS, SHELTERS } from "@/evacuation/data/glendale";
import { isAppleMobile } from "@/evacuation/format";
import { getActiveHazards, subscribeToHazards } from "@/evacuation/hazards";
import { DEFAULT_FIX, LocationTracker, type LocationFix } from "@/evacuation/location";
import { selectRoutingHazards } from "@/evacuation/marks";
import { RoutePlanner } from "@/evacuation/route-planner";
import { getRouteIn } from "@/evacuation/route-provider";
import { haversine, nearestHazard } from "@/evacuation/routing";
import { registerServiceWorker } from "@/lib/service-worker";
import type { MapHandle } from "./evacuation-map";
import { FirePanel } from "./fire-panel";
import { HelpButton } from "./help-dialog";
import { RouteBar } from "./route-bar";
import { applyTheme, currentTheme, subscribeTheme, type Theme } from "./theme";
import { MoonIcon, SunIcon } from "./theme-icons";
import { LanguageSelect } from "./language-select";
import { LANGUAGE_LABEL, type Locale } from "@/i18n/locales";
import { DIRECTIONS_LANGUAGE, mapText } from "@/i18n/map";
import { MapTextProvider, useMapText } from "./map-text";

// Mapbox GL touches `window` and WebGL on import, so the map only ever renders in the browser.
const EvacuationMap = dynamic(() => import("./evacuation-map").then((mod) => mod.EvacuationMap), {
  ssr: false,
  loading: function MapLoading() { return <div className="ev-map map-loading" role="status">{useMapText().loadingMap}</div>; },
});

/** Within this distance of a hazard's edge, the escape route is listed first. */
const ESCAPE_PRIORITY_METERS = 3_000;

const subscribeNever = () => () => {};
function subscribeOnline(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/** Stable per start location: GPS movement keeps one identity; a new address or fallback is a new one. */
const startIdentity = (fix: LocationFix) => (fix.source === "gps" ? "gps" : `${fix.source}:${fix.lat},${fix.lng}`);

/** The homepage: fire marks and directions on one full-screen map, with the route bar underneath. */
export function MapScreen({ locale = "en" }: { locale?: Locale } = {}) {
  const t = mapText(locale);
  const [tracker] = useState(() => new LocationTracker());
  const [planner] = useState(() => new RoutePlanner<LocationFix>({
    getRoute: getRouteIn(DIRECTIONS_LANGUAGE[locale]), shelters: SHELTERS, zones: SAFE_ZONES, isOnline: () => navigator.onLine,
  }));
  const location = useSyncExternalStore(tracker.subscribe, tracker.getSnapshot, tracker.getSnapshot);
  const { plan, pending, escapeRequested } = useSyncExternalStore(planner.subscribe, planner.getSnapshot, planner.getSnapshot);
  const stubHazards = useSyncExternalStore(subscribeToHazards, getActiveHazards, getActiveHazards);
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const appleMaps = useSyncExternalStore(subscribeNever, () => isAppleMobile(navigator), () => false);
  // <html data-theme> is set before paint by the layout's theme script.
  const theme = useSyncExternalStore<Theme>(subscribeTheme, currentTheme, () => "light");
  const [locateCount, setLocateCount] = useState(0);

  const [marks, setMarks] = useState<FireMark[]>([]);
  const [ready, setReady] = useState(false);
  const [canStore, setCanStore] = useState(true);
  const [hint, setHint] = useState<string | null>(null);
  const mapRef = useRef<MapHandle | null>(null);

  // Private marks remain visible as pins, but cannot become a reported fire or steer directions.
  const hazards = selectRoutingHazards({ sourceHazards: stubHazards, privateMarks: marks });
  const fix = location.fix;
  const metersFromGlendale = fix?.source === "gps" ? haversine(fix, GLENDALE_CITY_HALL) : 0;
  const outsideArea = metersFromGlendale > SERVICE_RADIUS_METERS;
  const origin = fix && (outsideArea ? DEFAULT_FIX : fix);
  const threat = origin ? nearestHazard(origin, hazards) : null;
  const escapeFirst = threat !== null && threat.edgeMeters <= ESCAPE_PRIORITY_METERS;

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
  // Like a maps app: ask for location as soon as the page opens (the browser shows its prompt).
  useEffect(() => {
    tracker.activate();
    return () => tracker.stop();
  }, [tracker]);
  useEffect(() => () => planner.stop(), [planner]);
  useEffect(() => {
    if (origin) planner.update(origin, hazards);
  }, [planner, origin, hazards]);
  useEffect(() => {
    if (online) planner.refresh();
  }, [planner, online]);
  useEffect(registerServiceWorker, []);

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
    setHint(marks.length >= MAX_MARKS ? t.placedAtLimit(MAX_MARKS) : t.placed);
  }

  const identity = origin ? startIdentity(origin) : null;
  // Center on each new start location (and on "my location"); fit once to its first routes, and
  // again when the escape route is requested and resolves, so it lands on screen too.
  const centerKey = identity && `${identity}:${locateCount}`;
  const escapeReady = plan ? plan.escape.kind !== "not-requested" : false;
  const fitKey = identity && plan && startIdentity(plan.origin) === identity ? `${identity}:${escapeReady}` : null;
  // Like tapping the arrow in a maps app: with no device location yet, the locate and Escape buttons ask for it.
  const askLocation = location.status === "fallback" && (location.reason === "prompt" || location.reason === "unavailable");

  return (
    <MapTextProvider locale={locale}>
    <main className="map-screen ev-shell">
      <h1 className="sr-only">{t.screenTitle}</h1>
      <div className="ev-map-area">
        <EvacuationMap
          dark={theme === "dark"} origin={origin} hazards={hazards} shelters={SHELTERS} zones={SAFE_ZONES} plan={plan}
          centerKey={centerKey} fitKey={fitKey} marks={marks} onReady={onReady}
          onMoveMark={(id, lat, lng) => save(moveMark(marks, id, lat, lng))}
          onRemoveMark={(id) => { save(marks.filter((mark) => mark.id !== id)); setHint(t.markRemoved); }}
        />
        <FirePanel
          ready={ready} count={marks.length} hint={hint} map={mapRef} onPlace={place} onHint={setHint}
          onClear={() => { save([]); setHint(t.marksCleared); }}
          help={<HelpButton />}
        >
          {origin && (
            <button type="button" className="ev-float-button ev-round ev-locate"
              onClick={() => (askLocation ? tracker.start() : setLocateCount((n) => n + 1))}
              aria-label={askLocation ? t.shareMyLocation : origin.source === "gps" ? t.centerOnMe : t.centerOnStart}>
              <span className="ev-locate-icon" aria-hidden="true" />
            </button>
          )}
        </FirePanel>
        <div className="map-actions">
          <LanguageSelect current={locale} label={LANGUAGE_LABEL[locale]} returnTo="/" className="map-lang-select" />
          <button type="button" className="theme-toggle" onClick={() => applyTheme(theme === "dark" ? "light" : "dark", true)}
            aria-label={theme === "dark" ? t.switchToLight : t.switchToDark} title={theme === "dark" ? t.lightMode : t.darkMode}>
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>
          <Link className="map-brand" href="/prepare" aria-label={t.prepLinkLabel}>
            <span className="brand-mark" aria-hidden="true"><span /></span>
            <span>{t.prepLink} <span aria-hidden="true">↗</span></span>
          </Link>
        </div>
        {!canStore && <p className="map-storage-warning" role="status">{t.storageWarning}</p>}
      </div>
      <RouteBar
        location={location}
        origin={origin}
        outsideAreaMeters={outsideArea ? metersFromGlendale : null}
        hazards={hazards}
        threat={threat}
        escapeFirst={escapeFirst}
        plan={plan}
        pending={pending}
        online={online}
        appleMaps={appleMaps}
        escapeRequested={escapeRequested}
        onUseLocation={() => tracker.start()}
        onManualLocation={(place) => tracker.setManual(place, place.label)}
        onRetryRoutes={() => planner.refresh()}
        onRequestEscape={() => { if (!origin || askLocation) tracker.start(); planner.requestEscape(); }}
        onClearEscape={() => planner.clearEscape()}
      />
    </main>
    </MapTextProvider>
  );
}
