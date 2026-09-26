"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";
import { useSheet } from "./use-sheet";
import {
  compassDirection, directionsUrl, formatDuration, formatMiles, formatShortDistance,
} from "@/evacuation/format";
import { geocode, type GeocodeResult } from "@/evacuation/geocode";
import { isApproximate, type LocationFix, type LocationState } from "@/evacuation/location";
import type { RoutePlan } from "@/evacuation/route-planner";
import { bearing, escapeHeading, haversine, routeIntersectsHazard } from "@/evacuation/routing";
import type { Hazard, Route, SafeZone, Shelter } from "@/evacuation/types";

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
  summary: string;
  danger?: boolean;
  /** Where "Go" opens native directions; absent when no usable route should be offered. */
  goTo?: Shelter | SafeZone;
  details: ReactNode;
};

/**
 * Directions drawer: a bottom sheet on phones (like Apple Maps, with an escape button where its search field sits)
 * and a left side card on wider screens. The escape button, fire warning and status make up the peek.
 */
export function RouteBar(props: RouteBarProps) {
  const { location, origin, threat, escapeFirst, escapeRequested, online } = props;
  const [open, setOpen] = useState<"escape" | "shelter" | null>(null);
  const [hidden, setHidden] = useState(false);
  const { snap, setSnap, dragging, style, handleProps, sheetRef, innerRef, peekRef } = useSheet();

  // The peek holds one line under the button: the fire warning when there is one, otherwise the location status.
  const danger = origin && threat && escapeFirst ? (
    <p className="ev-danger" role="status">
      <span aria-hidden="true">🔥 </span>
      {threat.edgeMeters <= 0
        ? `You appear to be inside the hazard area (${threat.hazard.label}). `
        : `${threat.hazard.label} is ${threat.edgeMeters < 161 ? "less than 0.1 mi" : formatMiles(threat.edgeMeters)} away. `}
      {escapeRequested ? "Take the escape route." : "Tap Escape."}
    </p>
  ) : null;
  const status = <StatusLine {...props} onEditing={(editing) => editing && setSnap("half")} />;

  const requestEscape = () => { props.onRequestEscape(); setSnap("half"); };
  const clearEscape = () => { props.onClearEscape(); setOpen(null); setSnap("peek"); };

  return (
    <section
      ref={sheetRef} style={style} aria-labelledby="ev-bar-title"
      className={`ev-bar ev-sheet ev-sheet-${snap}${dragging ? " ev-sheet-dragging" : ""}${hidden ? " ev-sheet-hidden" : ""}`}
    >
      <button
        type="button" className="ev-sheet-handle" aria-expanded={snap !== "peek"} aria-controls="ev-sheet-body"
        aria-label={snap === "full" ? "Collapse directions" : "Expand directions"} {...handleProps}
      >
        <span aria-hidden="true" />
      </button>
      <button
        type="button" className="ev-sheet-tab" aria-expanded={!hidden} aria-controls="ev-sheet-body"
        aria-label={hidden ? "Show directions" : "Hide directions"} onClick={() => setHidden(!hidden)}
      >
        <span aria-hidden="true">{hidden ? "›" : "‹"}</span>
      </button>
      <div className="ev-sheet-scroll">
        <div className="ev-sheet-inner" ref={innerRef}>
          <h2 id="ev-bar-title" className="ev-sr-only">Directions</h2>
          <div className="ev-sheet-peek" ref={peekRef}>
            {escapeRequested ? (
              <ul className="ev-rows">
                <EscapeRow
                  view={escapeRow(props)} appleMaps={props.appleMaps} expanded={open === "escape"}
                  onToggle={() => setOpen(open === "escape" ? null : "escape")} onClear={clearEscape}
                />
              </ul>
            ) : (
              <button type="button" className="ev-escape-cta" onClick={requestEscape} aria-label="Escape: get an escape route">
                <span aria-hidden="true">🚗</span> Escape
              </button>
            )}
            {danger ?? status}
          </div>
          <div id="ev-sheet-body" className="ev-sheet-body">
            {danger && status}
            {location.status !== "idle" && (
              <ul className="ev-rows">
                <RouteRow
                  kind="shelter" view={shelterRow(props)} appleMaps={props.appleMaps}
                  expanded={open === "shelter"} onToggle={() => setOpen(open === "shelter" ? null : "shelter")}
                />
              </ul>
            )}
            <p className="ev-note">
              Live fire data isn’t connected, so this is not an all-clear. Follow official orders; to report a fire, call 911.
            </p>
          </div>
        </div>
      </div>
      {!online && <span className="ev-sr-only" role="status">You are offline.</span>}
    </section>
  );
}

const FALLBACK_COPY = {
  denied: "Location is off for this site. Routes start from Glendale City Hall.",
  unavailable: "Couldn’t find your location. Routes start from Glendale City Hall for now.",
  insecure: "Location needs a secure (https://) page. Routes start from Glendale City Hall.",
  unsupported: "This browser can’t share location. Routes start from Glendale City Hall.",
} as const;

function StatusLine({ location, outsideAreaMeters, online, pending, onUseLocation, onManualLocation, onEditing }: RouteBarProps & {
  onEditing: (editing: boolean) => void;
}) {
  const [editing, setEditingState] = useState(false);
  const setEditing = (next: boolean) => { setEditingState(next); onEditing(next); };
  const choose = (place: GeocodeResult) => { setEditing(false); onManualLocation(place); };
  const enterAddress = (
    <button type="button" className="ev-link-button" onClick={() => setEditing(!editing)} aria-expanded={editing}>
      {editing ? "Cancel" : "Enter address"}
    </button>
  );

  let message: ReactNode;
  let actions: ReactNode = null;
  let warn = false;
  switch (location.status) {
    case "idle":
    case "locating":
      message = location.status === "locating" && location.attempt === 2
        ? "Still looking for your location…"
        : "Allow location access to see routes from where you are.";
      actions = enterAddress;
      break;
    case "fallback":
      warn = true;
      message = FALLBACK_COPY[location.reason];
      actions = (
        <>
          {location.reason === "unavailable" && <button type="button" className="ev-link-button" onClick={onUseLocation}>Try again</button>}
          {enterAddress}
        </>
      );
      break;
    case "manual":
      message = `From ${location.fix.label}`;
      actions = (
        <>
          <button type="button" className="ev-link-button" onClick={onUseLocation}>Use my location</button>
          {enterAddress}
        </>
      );
      break;
    case "tracking":
      if (outsideAreaMeters !== null) {
        warn = true;
        message = `You’re ${formatMiles(outsideAreaMeters)} from Glendale; routes start from Glendale City Hall.`;
        actions = enterAddress;
      } else if (isApproximate(location.fix)) {
        message = `Location approximate (±${formatShortDistance(location.fix.accuracyMeters ?? 0)})`;
      }
      break;
  }
  if (!online) {
    warn = true;
    message = <>Offline: straight-line directions only. {message}</>;
  }
  if (!message && !pending) return null;
  return (
    <div className={`ev-status${warn ? " ev-status-warn" : ""}`}>
      <p role="status">
        {message}
        {pending && <span className="ev-updating">{message ? " · " : ""}Updating routes…</span>}
      </p>
      {actions && <div className="ev-status-actions">{actions}</div>}
      {editing && <AddressForm onLocated={choose} />}
    </div>
  );
}

function AddressForm({ onLocated }: { onLocated: (place: GeocodeResult) => void }) {
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
      <label htmlFor={inputId} className="ev-sr-only">Address or ZIP code</label>
      <input
        id={inputId} value={query} onChange={(event) => setQuery(event.target.value)} required autoFocus
        autoComplete="street-address" enterKeyHint="search" placeholder="Address or ZIP, e.g. 91208"
      />
      <button type="submit" className="ev-button" disabled={state === "searching"}>
        {state === "searching" ? "Finding…" : "Go"}
      </button>
      {state === "not-found" && <p className="ev-form-error" role="status">No match near Glendale. Try a street address or ZIP.</p>}
      {state === "error" && <p className="ev-form-error" role="status">Address search isn’t available right now. Check your connection.</p>}
    </form>
  );
}

/** Escape row: a call-to-action button until requested, then the normal route row plus a Clear control. */
function EscapeRow({ view, appleMaps, expanded, onToggle, onClear }: {
  view: RowView; appleMaps: boolean; expanded: boolean; onToggle: () => void; onClear: () => void;
}) {
  return (
    <RouteRow
      kind="escape" appleMaps={appleMaps} expanded={expanded} onToggle={onToggle}
      view={{ ...view, details: <>{view.details}<ClearButton onClear={onClear} /></> }}
    />
  );
}

function ClearButton({ onClear }: { onClear: () => void }) {
  return <button type="button" className="ev-button ev-button-quiet" onClick={onClear}>Hide escape route</button>;
}

function RouteRow({ kind, view, appleMaps, expanded, onToggle }: {
  kind: "escape" | "shelter"; view: RowView; appleMaps: boolean; expanded: boolean; onToggle: () => void;
}) {
  const detailsId = useId();
  return (
    <li className={`ev-row ev-row-${kind}`}>
      <button type="button" className="ev-row-main" aria-expanded={expanded} aria-controls={detailsId} onClick={onToggle}>
        <span className="ev-row-icon" aria-hidden="true">{kind === "escape" ? "🚗" : "🏠"}</span>
        <span className="ev-row-text">
          <span className="ev-row-title">{view.title}</span>
          <span className={`ev-row-summary${view.danger ? " ev-danger-text" : ""}`}>{view.summary}</span>
        </span>
        <span className="ev-row-chevron" aria-hidden="true">{expanded ? "▾" : "▸"}</span>
      </button>
      {view.goTo && (
        <a className={`ev-go ev-go-${kind}`} href={directionsUrl(view.goTo, appleMaps)} target="_blank" rel="noopener noreferrer">
          Go<span className="ev-sr-only"> to {view.goTo.name} in {appleMaps ? "Apple Maps" : "Google Maps"}</span>
        </a>
      )}
      <div id={detailsId} className="ev-row-details" hidden={!expanded}>{view.details}</div>
    </li>
  );
}

function waiting(pending: boolean, text: string): RowView {
  return { title: "", summary: pending ? text : "Waiting for a start location…", details: null };
}

function escapeRow({ plan, origin, hazards, online, onRetryRoutes }: RouteBarProps): RowView {
  const title = "Escape route";
  const pick = plan?.escape;
  // Requested but not yet resolved (no origin yet, or the request is still in flight).
  if (!pick || pick.kind === "not-requested" || !origin) {
    return { title, summary: "Finding the fastest way out…", details: null };
  }
  if (pick.kind === "no-zone") return { title, summary: "No evacuation point configured", details: null };
  if (pick.kind === "route") {
    return {
      title,
      summary: `Head ${compassDirection(bearing(origin, pick.zone))} toward ${pick.zone.name} · ${formatDuration(pick.route.durationSeconds)}`,
      goTo: pick.zone,
      details: (
        <>
          <p className="ev-meta">{formatMiles(pick.route.distanceMeters)} · {pick.zone.description}</p>
          <Steps route={pick.route} />
        </>
      ),
    };
  }
  const heading = escapeHeading(origin, pick.zone, hazards);
  const direction = compassDirection(heading.bearing);
  return {
    title,
    danger: pick.kind === "no-safe-route",
    summary: heading.toward === "target"
      ? `Head ${direction} toward ${pick.zone.name} · ${formatMiles(haversine(origin, pick.zone))} straight-line`
      : `Head ${direction}, away from ${heading.hazard.label}`,
    // A maps app would take the same road through the hazard, so only link when routing itself failed.
    goTo: pick.kind === "routing-unavailable" ? pick.zone : undefined,
    details: (
      <>
        {pick.kind === "no-safe-route" && (
          <p className="ev-meta ev-danger-text">
            Every driving route to an evacuation point passes close to a hazard. Follow official evacuation instructions.
          </p>
        )}
        <Compass heading={heading.bearing} meters={heading.toward === "target" ? haversine(origin, pick.zone) : null}
          reason={pick.kind === "routing-unavailable" ? pick.reason : null} />
        {online && pick.kind === "routing-unavailable" && <RetryButton onRetry={onRetryRoutes} />}
      </>
    ),
  };
}

function shelterRow({ plan, origin, hazards, pending, online, onRetryRoutes }: RouteBarProps): RowView {
  const title = "Nearest shelter";
  const pick = plan?.shelter;
  if (!pick || !origin) return { ...waiting(pending, "Finding the nearest open shelter…"), title };
  if (pick.kind === "no-safe-route") {
    return {
      title, danger: true, summary: "No safe shelter route — follow evacuation route.",
      details: <p className="ev-meta">Every driving route to an open shelter passed close to a hazard.</p>,
    };
  }
  if (pick.kind === "no-shelter") {
    return { title, danger: true, summary: "No open shelter away from active hazards.", details: null };
  }
  const { shelter } = pick;
  if (pick.kind === "route") {
    return {
      title,
      summary: `${shelter.name} · ${formatMiles(pick.route.distanceMeters)} · ${formatDuration(pick.route.durationSeconds)}`,
      goTo: shelter,
      details: (
        <>
          <p className="ev-meta">{shelter.address}</p>
          <ShelterFacts shelter={shelter} />
          <Steps route={pick.route} />
        </>
      ),
    };
  }
  const heading = bearing(origin, shelter);
  return {
    title,
    summary: `${shelter.name} · ${compassDirection(heading)} ${formatMiles(haversine(origin, shelter))} straight-line`,
    goTo: shelter,
    details: (
      <>
        <Compass heading={heading} meters={haversine(origin, shelter)} reason={pick.reason} />
        {routeIntersectsHazard([origin, shelter], hazards, { origin }) && (
          <p className="ev-meta ev-danger-text">The straight line passes near a hazard. Use roads that keep away from it.</p>
        )}
        <p className="ev-meta">{shelter.address}</p>
        <ShelterFacts shelter={shelter} />
        {online && <RetryButton onRetry={onRetryRoutes} />}
      </>
    ),
  };
}

function ShelterFacts({ shelter }: { shelter: Shelter }) {
  const known = (value: boolean | null) => (value === null ? "unknown" : value ? "yes" : "no");
  return (
    <p className="ev-facts">
      {!shelter.verified && <span className="ev-badge">Unverified: confirm it’s open</span>}
      <span>Pets: {known(shelter.petsAllowed)}</span>
      <span>ADA accessible: {known(shelter.adaCompliant)}</span>
    </p>
  );
}

function RetryButton({ onRetry }: { onRetry: () => void }) {
  return <button type="button" className="ev-button ev-button-quiet" onClick={onRetry}>Retry road directions</button>;
}

/** Offline / routing-failure guidance: north-up compass arrow plus straight-line distance. */
function Compass({ heading, meters, reason }: { heading: number; meters: number | null; reason: "offline" | "provider-error" | null }) {
  const direction = compassDirection(heading);
  return (
    <div className="ev-straight">
      <div className="ev-compass" role="img" aria-label={`Arrow pointing ${direction}, ${Math.round(heading)} degrees from north`}>
        <span className="ev-compass-north" aria-hidden="true">N</span>
        <svg viewBox="0 0 48 48" aria-hidden="true" style={{ transform: `rotate(${heading}deg)` }}>
          <path d="M24 3 L35 41 L24 33 L13 41 Z" fill="currentColor" />
        </svg>
      </div>
      <div>
        <p className="ev-strong">
          {direction[0].toUpperCase() + direction.slice(1)}{meters !== null && `, ${formatMiles(meters)} straight-line`}
        </p>
        <p className="ev-meta">
          {reason === "offline" ? "Offline: road directions unavailable. " : reason === "provider-error" ? "Road directions unavailable right now. " : ""}
          Arrow is relative to north, not your phone’s heading.
        </p>
      </div>
    </div>
  );
}

function Steps({ route }: { route: Route }) {
  if (route.steps.length === 0) return null;
  return (
    <ol className="ev-steps">
      {route.steps.map((step, index) => (
        <li key={index}>
          <span>{step.instruction}</span>
          {step.distanceMeters > 0 && <span className="ev-step-distance">{formatShortDistance(step.distanceMeters)}</span>}
        </li>
      ))}
    </ol>
  );
}
