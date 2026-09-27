"use client";

import Image from "next/image";
import { useEffect, useId, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { DotLottieReact, type DotLottie } from "@lottiefiles/dotlottie-react";
import { Icon, TurnIcon } from "./detail-icons";
import shelterIcon from "./shelter-icon.png";
import { useSheet } from "./use-sheet";
import {
  compassDirection, directionsUrl, formatDuration, formatMiles, formatShortDistance,
} from "@/evacuation/format";
import { geocode, type GeocodeResult } from "@/evacuation/geocode";
import { isApproximate, type LocationFix, type LocationState } from "@/evacuation/location";
import type { RoutePlan } from "@/evacuation/route-planner";
import { bearing, escapeHeading, haversine, routeIntersectsHazard } from "@/evacuation/routing";
import type { Hazard, Route, SafeZone, Shelter } from "@/evacuation/types";
import type { MapText } from "@/i18n/map";
import { hazardName, useMapText } from "./map-text";

export type Threat = { hazard: Hazard; edgeMeters: number };

export type RouteBarProps = {
  location: LocationState;
  /** Route start actually used (City Hall when far outside Glendale). */
  origin: LocationFix | null;
  /** Set when the device is outside the Glendale service radius. */
  outsideAreaMeters: number | null;
  hazards: readonly Hazard[];
  threat: Threat | null;
  escapeFirst: boolean;
  plan: RoutePlan<LocationFix> | null;
  pending: boolean;
  online: boolean;
  appleMaps: boolean;
  /** The user has asked for an escape route; until then the button, not a route, is shown. */
  escapeRequested: boolean;
  onUseLocation: () => void;
  onManualLocation: (place: GeocodeResult) => void;
  onRetryRoutes: () => void;
  onRequestEscape: () => void;
  onClearEscape: () => void;
};

type RowView = {
  title: string;
  /** The headline: where to go or which way to head. */
  summary: string;
  /** A quieter second line (time in bold, then distance). */
  sub?: ReactNode;
  danger?: boolean;
  /** Where "Go" opens native directions; absent when no usable route should be offered. */
  goTo?: Shelter | SafeZone;
  details: ReactNode;
};

/**
 * Directions drawer: a left side card on wider screens. On phones only the escape button shows (the sheet is
 * "idle") until it is pressed; it then opens as a bottom sheet, and sliding it all the way down brings the button back. The escape button, fire warning and status make up the peek.
 */
export function RouteBar(props: RouteBarProps) {
  const { location, origin, threat, escapeFirst, escapeRequested, online } = props;
  const t = useMapText();
  const [open, setOpen] = useState<"escape" | "shelter" | null>(null);
  const [hidden, setHidden] = useState(false);
  // On phones, sliding the drawer all the way down closes the escape route and brings the button back.
  const { snap, setSnap, dragging, style, handleProps, sheetRef, innerRef, peekRef } = useSheet({
    onCollapse: () => { if (escapeRequested) clearEscape(); },
  });

  // The peek holds one line under the button: the fire warning when there is one, otherwise the location status.
  const danger = origin && threat && escapeFirst ? (
    <p className="ev-danger" role="status">
      <span aria-hidden="true">🔥 </span>
      {threat.edgeMeters <= 0
        ? t.insideHazard(hazardName(threat.hazard, t))
        : t.hazardAway(hazardName(threat.hazard, t), threat.edgeMeters < 161 ? t.lessThanTenthMile : formatMiles(threat.edgeMeters, t.units))}
      {escapeRequested ? t.takeEscapeRoute : t.tapEscape}
    </p>
  ) : null;
  const status = <StatusLine {...props} onEditing={(editing) => editing && setSnap("half")} />;

  const requestEscape = () => { props.onRequestEscape(); setSnap("half"); };
  const clearEscape = () => { props.onClearEscape(); setOpen(null); setSnap("peek"); };

  return (
    <section
      ref={sheetRef} style={style} aria-labelledby="ev-bar-title"
      className={`ev-bar ev-sheet ev-sheet-${snap}${dragging ? " ev-sheet-dragging" : ""}${hidden ? " ev-sheet-hidden" : ""}${escapeRequested ? "" : " ev-sheet-idle"}`}
    >
      <button
        type="button" className="ev-sheet-handle" aria-expanded={snap !== "peek"} aria-controls="ev-sheet-body"
        aria-label={snap === "peek" ? t.expandDirections : t.collapseDirections} {...handleProps}
      >
        <span aria-hidden="true" />
      </button>
      <button
        type="button" className="ev-sheet-tab" aria-expanded={!hidden} aria-controls="ev-sheet-body"
        aria-label={hidden ? t.showDirections : t.hideDirections} onClick={() => setHidden(!hidden)}
      >
        <span aria-hidden="true">{hidden ? "›" : "‹"}</span>
      </button>
      <div className="ev-sheet-scroll">
        <div className="ev-sheet-inner" ref={innerRef}>
          <h2 id="ev-bar-title" className="ev-sr-only">{t.directions}</h2>
          <div className="ev-sheet-peek" ref={peekRef}>
            {escapeRequested ? (
              <ul className="ev-rows">
                <EscapeRow
                  view={escapeRow(props, t)} appleMaps={props.appleMaps} expanded={open === "escape"}
                  onToggle={() => setOpen(open === "escape" ? null : "escape")} onClear={clearEscape}
                />
              </ul>
            ) : (
              <button type="button" className="ev-escape-cta" onClick={requestEscape} aria-label={t.escapeLabel}>
                <EscapeFire /> {t.escape}
              </button>
            )}
            {danger ?? status}
          </div>
          <div id="ev-sheet-body" className="ev-sheet-body">
            {danger && status}
            {location.status !== "idle" && (
              <ul className="ev-rows">
                <RouteRow
                  kind="shelter" view={shelterRow(props, t)} appleMaps={props.appleMaps}
                  expanded={open === "shelter"} onToggle={() => setOpen(open === "shelter" ? null : "shelter")}
                />
              </ul>
            )}
            <p className="ev-note ev-with-icon"><Icon name="info" /><span>{t.notAllClear}</span></p>
          </div>
        </div>
      </div>
      {!online && <span className="ev-sr-only" role="status">{t.youAreOffline}</span>}
    </section>
  );
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** The brand's animated fire (as in the preloader and fire marks) on the Escape button; still under reduced motion. */
function EscapeFire() {
  const still = useSyncExternalStore(subscribeReducedMotion, () => window.matchMedia(REDUCED_MOTION).matches, () => false);
  const [player, setPlayer] = useState<DotLottie | null>(null);
  // Pause rather than remount, so the animation file is fetched once.
  useEffect(() => {
    if (!player) return;
    const apply = () => (still ? player.pause() : player.play());
    apply();
    // Autoplay starts once the file loads, so apply again then.
    player.addEventListener("load", apply);
    return () => player.removeEventListener("load", apply);
  }, [player, still]);
  return (
    <span className="ev-escape-fire" aria-hidden="true">
      <DotLottieReact src="/animations/fire.lottie" loop autoplay={!still} dotLottieRefCallback={setPlayer} />
    </span>
  );
}

const FALLBACK_COPY = {
  denied: "From Glendale City Hall · Location off",
  prompt: "From Glendale City Hall",
  unavailable: "Couldn’t find your location. Routes start from Glendale City Hall for now.",
  insecure: "Location needs a secure (https://) page. Routes start from Glendale City Hall.",
  unsupported: "This browser can’t share location. Routes start from Glendale City Hall.",
} as const;

function StatusLine({ location, outsideAreaMeters, online, pending, onUseLocation, onManualLocation, onEditing }: RouteBarProps & {
  onEditing: (editing: boolean) => void;
}) {
  const t = useMapText();
  const [editing, setEditingState] = useState(false);
  const setEditing = (next: boolean) => { setEditingState(next); onEditing(next); };
  const choose = (place: GeocodeResult) => { setEditing(false); onManualLocation(place); };
  const enterAddress = (
    <button type="button" className="ev-link-button" onClick={() => setEditing(!editing)} aria-expanded={editing}>
      {editing ? t.cancel : t.enterAddress}
    </button>
  );
  const useLocation = (
    <button type="button" className="ev-ask-button" onClick={onUseLocation}><LocationArrow />{t.useMyLocation}</button>
  );

  let message: ReactNode = null;
  let actions: ReactNode = null;
  let warn = false;
  switch (location.status) {
    case "idle":
      actions = <>{useLocation}{enterAddress}</>;
      break;
    case "locating":
      // The browser's own prompt is up, or location is on its way.
      if (location.attempt === 2) message = t.locating;
      actions = enterAddress;
      break;
    case "fallback":
      warn = location.reason !== "prompt";
      message = t.fallback[location.reason];
      actions = (
        <>
          {location.reason === "prompt" && useLocation}
          {location.reason === "unavailable" && <button type="button" className="ev-link-button" onClick={onUseLocation}>{t.tryAgain}</button>}
          {enterAddress}
        </>
      );
      break;
    case "manual":
      message = t.fromPlace(location.fix.label ?? t.chosenLocation);
      actions = (
        <>
          <button type="button" className="ev-link-button" onClick={onUseLocation}>{t.useMyLocation}</button>
          {enterAddress}
        </>
      );
      break;
    case "tracking":
      if (outsideAreaMeters !== null) {
        warn = true;
        message = t.outsideGlendale(formatMiles(outsideAreaMeters, t.units));
        actions = enterAddress;
      } else if (isApproximate(location.fix)) {
        message = t.approximate(formatShortDistance(location.fix.accuracyMeters ?? 0, t.units));
      }
      break;
  }
  if (!online) {
    warn = true;
    message = <>{t.offlineStraightOnly} {message}</>;
  }
  if (!message && !actions && !pending) return null;
  return (
    <div className={`ev-status${warn ? " ev-status-warn" : ""}`}>
      {(message || pending) && (
        <p role="status">
          {message}
          {pending && <span className="ev-updating">{message ? " · " : ""}{t.updatingRoutes}</span>}
        </p>
      )}
      {actions && <div className="ev-status-actions">{actions}</div>}
      {editing && <AddressForm onLocated={choose} />}
    </div>
  );
}

function LocationArrow() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M21 3 3 10.5l7.5 3 3 7.5L21 3z" fill="currentColor" /></svg>
  );
}

function AddressForm({ onLocated }: { onLocated: (place: GeocodeResult) => void }) {
  const t = useMapText();
  const inputId = useId();
  const [query, setQuery] = useState("");
  const [state, setState] = useState<"idle" | "searching" | "not-found" | "error">("idle");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("searching");
    try {
      const place = await geocode(query);
      if (!place) return setState("not-found");
      setState("idle");
      onLocated(place);
    } catch {
      setState("error");
    }
  }

  return (
    <form className="ev-form" onSubmit={submit}>
      <label htmlFor={inputId} className="ev-sr-only">{t.addressLabel}</label>
      <input
        id={inputId} value={query} onChange={(event) => setQuery(event.target.value)} required autoFocus
        autoComplete="street-address" enterKeyHint="search" placeholder={t.addressPlaceholder}
      />
      <button type="submit" className="ev-button" disabled={state === "searching"}>
        {state === "searching" ? t.finding : t.go}
      </button>
      {state === "not-found" && <p className="ev-form-error" role="status">{t.noAddressMatch}</p>}
      {state === "error" && <p className="ev-form-error" role="status">{t.addressSearchDown}</p>}
    </form>
  );
}

/** Escape row: the normal route row plus a close control that brings the Escape button back (side card only; phones swipe down). */
function EscapeRow({ view, appleMaps, expanded, onToggle, onClear }: {
  view: RowView; appleMaps: boolean; expanded: boolean; onToggle: () => void; onClear: () => void;
}) {
  const t = useMapText();
  return (
    <RouteRow
      kind="escape" view={view} appleMaps={appleMaps} expanded={expanded} onToggle={onToggle}
      action={
        <button type="button" className="ev-escape-close" aria-label={t.hideEscapeRoute} onClick={onClear}>
          <span aria-hidden="true">✕</span>
        </button>
      }
    />
  );
}

function RouteRow({ kind, view, appleMaps, expanded, onToggle, action }: {
  kind: "escape" | "shelter"; view: RowView; appleMaps: boolean; expanded: boolean; onToggle: () => void; action?: ReactNode;
}) {
  const t = useMapText();
  const detailsId = useId();
  return (
    <li className={`ev-row ev-row-${kind}`}>
      <button type="button" className="ev-row-main" aria-expanded={expanded} aria-controls={detailsId} onClick={onToggle}>
        {kind === "shelter" ? (
          // Imported (not in public/) so it is served from /_next/static and the service worker keeps it for offline use.
          <span className="ev-row-icon ev-row-icon-image" aria-hidden="true"><Image src={shelterIcon} alt="" width={40} height={40} unoptimized /></span>
        ) : (
          <span className="ev-row-icon" aria-hidden="true"><RowGlyph kind={kind} /></span>
        )}
        <span className="ev-row-text">
          <span className="ev-row-title">{view.title}</span>
          <span className={`ev-row-summary${view.danger ? " ev-danger-text" : ""}`}>{view.summary}</span>
          {view.sub && <span className="ev-row-sub">{view.sub}</span>}
        </span>
        <svg className="ev-row-chevron" viewBox="0 0 8 14" aria-hidden="true" focusable="false">
          <path d="M1.5 1.5 6.5 7l-5 5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {view.goTo && (
        <a className={`ev-go ev-go-${kind}`} href={directionsUrl(view.goTo, appleMaps)} target="_blank" rel="noopener noreferrer">
          {t.go}<span className="ev-sr-only">{t.goTo(view.goTo.name, appleMaps ? "Apple Maps" : "Google Maps")}</span>
        </a>
      )}
      {action}
      <div id={detailsId} className="ev-row-details" hidden={!expanded}>{view.details}</div>
    </li>
  );
}

/** Filled glyphs in the style of SF Symbols, drawn white on the row's tinted circle. */
const GLYPHS = {
  escape: "M5 11l1.6-4.3A2 2 0 0 1 8.5 5.4h7a2 2 0 0 1 1.9 1.3L19 11a2 2 0 0 1 2 2v4a1 1 0 0 1-1 1h-1v1.5a1.5 1.5 0 0 1-3 0V18H8v1.5a1.5 1.5 0 0 1-3 0V18H4a1 1 0 0 1-1-1v-4a2 2 0 0 1 2-2zm2.2 0h9.6l-1.2-3.3a.8.8 0 0 0-.7-.5H9.1a.8.8 0 0 0-.7.5zM6.5 15.5a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5zm11 0a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5z",
} as const;

function RowGlyph({ kind }: { kind: keyof typeof GLYPHS }) {
  return (
    <svg viewBox="0 0 24 24" focusable="false"><path d={GLYPHS[kind]} fill="currentColor" fillRule="evenodd" /></svg>
  );
}

function waiting(pending: boolean, text: string, t: MapText): RowView {
  return { title: "", summary: pending ? text : t.waitingForStart, details: null };
}

function escapeRow({ plan, origin, hazards, online, onRetryRoutes }: RouteBarProps, t: MapText): RowView {
  const title = t.escapeRoute;
  const pick = plan?.escape;
  // Requested but not yet resolved (no origin yet, or the request is still in flight).
  if (!pick || pick.kind === "not-requested" || !origin) {
    return { title, summary: t.findingWayOut, details: null };
  }
  if (pick.kind === "no-zone") return { title, summary: t.noEvacuationPoint, details: null };
  if (pick.kind === "route") {
    return {
      title,
      ...splitSummary(t.headToward(t.compass[compassDirection(bearing(origin, pick.zone))], pick.zone.name, formatDuration(pick.route.durationSeconds, t.units))),
      sub: <TimeAndDistance route={pick.route} />,
      goTo: pick.zone,
      details: (
        <>
          <p className="ev-meta ev-with-icon"><Icon name="flag" /><span>{pick.zone.description}</span></p>
          <Steps route={pick.route} />
        </>
      ),
    };
  }
  const heading = escapeHeading(origin, pick.zone, hazards);
  const direction = t.compass[compassDirection(heading.bearing)];
  return {
    title,
    danger: pick.kind === "no-safe-route",
    ...(heading.toward === "target"
      ? splitSummary(t.headTowardStraight(direction, pick.zone.name, formatMiles(haversine(origin, pick.zone), t.units)))
      : { summary: t.headAway(direction, hazardName(heading.hazard, t)) }),
    // A maps app would take the same road through the hazard, so only link when routing itself failed.
    goTo: pick.kind === "routing-unavailable" ? pick.zone : undefined,
    details: (
      <>
        {pick.kind === "no-safe-route" && (
          <p className="ev-meta ev-danger-text">{t.everyEscapeNearHazard}</p>
        )}
        <Compass heading={heading.bearing} meters={heading.toward === "target" ? haversine(origin, pick.zone) : null}
          reason={pick.kind === "routing-unavailable" ? pick.reason : null} />
        {online && pick.kind === "routing-unavailable" && <RetryButton onRetry={onRetryRoutes} />}
      </>
    ),
  };
}

function shelterRow({ plan, origin, hazards, pending, online, onRetryRoutes }: RouteBarProps, t: MapText): RowView {
  const title = t.nearestShelter;
  const pick = plan?.shelter;
  if (!pick || !origin) return { ...waiting(pending, t.findingShelter, t), title };
  if (pick.kind === "no-safe-route") {
    return {
      title, danger: true, summary: t.noSafeShelterRoute,
      details: <p className="ev-meta">{t.everyShelterNearHazard}</p>,
    };
  }
  if (pick.kind === "no-shelter") {
    return { title, danger: true, summary: t.noOpenShelter, details: null };
  }
  const { shelter } = pick;
  if (pick.kind === "route") {
    return {
      title,
      summary: shelter.name,
      sub: <TimeAndDistance route={pick.route} />,
      goTo: shelter,
      details: (
        <>
          <Address shelter={shelter} />
          <ShelterFacts shelter={shelter} />
          <Steps route={pick.route} />
        </>
      ),
    };
  }
  const heading = bearing(origin, shelter);
  return {
    title,
    ...splitSummary(t.shelterStraight(shelter.name, t.compass[compassDirection(heading)], formatMiles(haversine(origin, shelter), t.units))),
    goTo: shelter,
    details: (
      <>
        <Compass heading={heading} meters={haversine(origin, shelter)} reason={pick.reason} />
        {routeIntersectsHazard([origin, shelter], hazards, { origin }) && (
          <p className="ev-meta ev-danger-text">{t.straightNearHazard}</p>
        )}
        <Address shelter={shelter} />
        <ShelterFacts shelter={shelter} />
        {online && <RetryButton onRetry={onRetryRoutes} />}
      </>
    ),
  };
}

/**
 * Splits a translated "headline · detail" summary at its last " · " (every locale appends the time or
 * distance that way), so the headline reads bold and the detail sits on the quieter second line.
 */
function splitSummary(text: string): Pick<RowView, "summary" | "sub"> {
  const at = text.lastIndexOf(" · ");
  return at < 0 ? { summary: text } : { summary: text.slice(0, at), sub: text.slice(at + 3) };
}

/** "**7 min** · 1.4 mi": the time is what matters in an evacuation, so it carries the weight. */
function TimeAndDistance({ route }: { route: Route }) {
  const t = useMapText();
  return <><strong>{formatDuration(route.durationSeconds, t.units)}</strong> · {formatMiles(route.distanceMeters, t.units)}</>;
}

function Address({ shelter }: { shelter: Shelter }) {
  return <p className="ev-meta ev-with-icon"><Icon name="pin" /><span>{shelter.address}</span></p>;
}

function ShelterFacts({ shelter }: { shelter: Shelter }) {
  const t = useMapText();
  const known = (value: boolean | null) => (value === null ? t.unknown : value ? t.yes : t.no);
  return (
    <p className="ev-facts">
      {!shelter.verified && <span className="ev-badge"><Icon name="warning" />{t.unverifiedShelter}</span>}
      <span className="ev-fact"><Icon name="paw" />{t.pets}: <strong>{known(shelter.petsAllowed)}</strong></span>
      <span className="ev-fact"><Icon name="accessible" />{t.adaAccessible}: <strong>{known(shelter.adaCompliant)}</strong></span>
    </p>
  );
}

function RetryButton({ onRetry }: { onRetry: () => void }) {
  const t = useMapText();
  return <button type="button" className="ev-button ev-button-quiet" onClick={onRetry}>{t.retryDirections}</button>;
}

/** Offline / routing-failure guidance: north-up compass arrow plus straight-line distance. */
function Compass({ heading, meters, reason }: { heading: number; meters: number | null; reason: "offline" | "provider-error" | null }) {
  const t = useMapText();
  const direction = t.compass[compassDirection(heading)];
  return (
    <div className="ev-straight">
      <div className="ev-compass" role="img" aria-label={t.arrowLabel(direction, Math.round(heading))}>
        <span className="ev-compass-north" aria-hidden="true">{t.northLetter}</span>
        <svg viewBox="0 0 48 48" aria-hidden="true" style={{ transform: `rotate(${heading}deg)` }}>
          <path d="M24 3 L35 41 L24 33 L13 41 Z" fill="currentColor" />
        </svg>
      </div>
      <div>
        <p className="ev-strong">
          {direction[0].toUpperCase() + direction.slice(1)}{meters !== null && t.straightLine(formatMiles(meters, t.units))}
        </p>
        <p className="ev-meta">
          {reason === "offline" ? t.offlineNoRoads : reason === "provider-error" ? t.roadsUnavailable : ""}
          {t.arrowNote}
        </p>
      </div>
    </div>
  );
}

function Steps({ route }: { route: Route }) {
  const t = useMapText();
  if (route.steps.length === 0) return null;
  return (
    <ol className="ev-steps">
      {route.steps.map((step, index) => (
        <li key={index}>
          <TurnIcon turn={step.turn} />
          <span className="ev-step-text">
            {step.distanceMeters > 0 && <strong className="ev-step-distance">{formatShortDistance(step.distanceMeters, t.units)}</strong>}
            <span>{step.instruction}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
