"use client";

import { useState } from "react";
import {
  ContextFeedSchema,
  StandingHazardFeedSchema,
  NoticeFeedSchema,
  type ContextFeed,
  type StandingHazard,
  type StandingHazardFeed,
  type NoticeFeed,
  type SourceCheck,
} from "@/domain/contracts";
import { GLENDALE_VIEW } from "@/lib/map-style";

type Point = [number, number];
type Place = { label: string; point: Point };
type Result<T> = { state: "received"; value: T } | { state: "unavailable" };
type Lookup =
  | { phase: "idle" }
  | { phase: "locating" }
  | { phase: "no-location" }
  | { phase: "loading"; place: Place }
  | { phase: "done"; place: Place; notices: Result<NoticeFeed>; context: Result<ContextFeed>; hazards: Result<StandingHazardFeed> };

const GLENDALE: Place = {
  label: "central Glendale (a general reference point, not your address)",
  point: [GLENDALE_VIEW.longitude, GLENDALE_VIEW.latitude],
};
const TIME = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short",
});

const DATE = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "short", day: "numeric" });

/** Calendar date with the year, for map editions that may be months or years old. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "date not given";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "date not given" : DATE.format(date);
}

/** Local display time with an explicit zone; unknown stays unknown. */
export function formatTime(value: string | null | undefined): string {
  if (!value) return "time not given";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "time not given" : TIME.format(date);
}

async function query<T>(path: string, point: Point, schema: { safeParse(v: unknown): { success: true; data: T } | { success: false } }): Promise<Result<T>> {
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ point, userInitiated: true }),
      cache: "no-store",
    });
    // Per-source failures arrive as typed checks; anything unparseable is unavailable, never empty.
    const parsed = schema.safeParse(await response.json());
    return parsed.success ? { state: "received", value: parsed.data } : { state: "unavailable" };
  } catch {
    return { state: "unavailable" };
  }
}

const STATUS_LABEL: Record<SourceCheck["status"], string> = {
  ok: "CHECKED", stale: "STALE", down: "UNAVAILABLE", "not-configured": "NOT SET UP", "outside-coverage": "OUTSIDE COVERAGE",
};

function SourceRow({ check }: { check: SourceCheck }) {
  return (
    <li className="live-source">
      <div><strong>{check.operator}</strong>
        <small>{check.status === "ok" ? `Checked ${formatTime(check.lastSuccessAt)}` : check.detail}</small></div>
      <span className={`status-tag status-${check.status}`}>{STATUS_LABEL[check.status]}</span>
    </li>
  );
}

const HAZARD_LABEL: Record<StandingHazard["hazard"], string> = {
  wildfire: "Fire hazard severity", flood: "FEMA flood zone", "fault-rupture": "Earthquake fault zone",
  liquefaction: "Liquefaction zone", landslide: "Earthquake landslide zone", "dam-inundation": "Dam inundation area",
  "debris-flow": "Post-fire debris flow",
};

/** Plain wording for a lookup; "not in a mapped zone" is never phrased as safe. */
export function hazardStatus(hazard: StandingHazard): string {
  if (hazard.lookup === "unavailable") return "not available here";
  // Every place has some FEMA zone; the zone itself is the answer.
  if (hazard.hazard === "flood" && hazard.lookup === "inside" && hazard.classification) return hazard.classification;
  if (hazard.lookup === "inside") return hazard.classification ? `inside (${hazard.classification})` : "inside a mapped zone";
  return hazard.classification ? `not in a mapped zone (${hazard.classification})` : "not in a mapped zone";
}

function sourceLink(url: string, label: string) {
  return <a href={url} target="_blank" rel="noopener noreferrer">{label} <span aria-hidden="true">↗</span></a>;
}

export function LiveSources() {
  const [lookup, setLookup] = useState<Lookup>({ phase: "idle" });
  const busy = lookup.phase === "locating" || lookup.phase === "loading";

  async function run(place: Place) {
    setLookup({ phase: "loading", place });
    const [notices, context, hazards] = await Promise.all([
      query("/api/v1/notices/query", place.point, NoticeFeedSchema),
      query("/api/v1/context/query", place.point, ContextFeedSchema),
      query("/api/v1/hazards/query", place.point, StandingHazardFeedSchema),
    ]);
    setLookup({ phase: "done", place, notices, context, hazards });
  }

  function useMyLocation() {
    if (!("geolocation" in navigator)) { setLookup({ phase: "no-location" }); return; }
    setLookup({ phase: "locating" });
    navigator.geolocation.getCurrentPosition(
      // One-time use; never stored. Rounded to about 100 m before leaving the device.
      ({ coords }) => void run({
        label: "your approximate location (used once, not saved)",
        point: [Math.round(coords.longitude * 1000) / 1000, Math.round(coords.latitude * 1000) / 1000],
      }),
      () => setLookup({ phase: "no-location" }),
      { enableHighAccuracy: false, maximumAge: 300_000, timeout: 15_000 },
    );
  }

  const done = lookup.phase === "done" ? lookup : null;
  const checks = done ? [
    ...(done.notices.state === "received" ? done.notices.value.sourceChecks : []),
    ...(done.context.state === "received" ? done.context.value.sourceChecks : []),
    ...(done.hazards.state === "received" ? done.hazards.value.sourceChecks : []),
  ] : [];
  const notices = done?.notices.state === "received" ? done.notices.value.notices : [];
  const context = done?.context.state === "received" ? done.context.value : null;
  const hazardFeed = done?.hazards.state === "received" ? done.hazards.value : null;

  return (
    <div className="live-panel" aria-labelledby="live-heading">
      <div className="live-head">
        <h3 id="live-heading">What public sources report right now</h3>
        <p>Checks weather alerts, reported fire incidents, mapped fire perimeters, air quality and Glendale hazard maps only when you ask. It does not check evacuation orders or your zone.</p>
        <div className="live-actions">
          <button type="button" className="area-button" onClick={() => void run(GLENDALE)} disabled={busy}>Check central Glendale <span aria-hidden="true">→</span></button>
          <button type="button" className="live-secondary" onClick={useMyLocation} disabled={busy}>Use my location once</button>
        </div>
      </div>

      <div aria-live="polite">
        {lookup.phase === "locating" && <p className="live-note">Waiting for your device to share an approximate location…</p>}
        {lookup.phase === "no-location" && <p className="live-note">Location wasn’t shared, so nothing was checked. You can check central Glendale instead.</p>}
        {lookup.phase === "loading" && <p className="live-note">Checking public sources for {lookup.place.label}…</p>}
        {done && <div className="live-results">
          <p className="live-note">Results for {done.place.label}. <strong>Nothing listed here is not an all-clear.</strong> Missing or unavailable sources mean unknown, not safe.</p>

          <ul className="live-sources" aria-label="Source status">
            {checks.map((check) => <SourceRow key={check.sourceKey} check={check} />)}
            {done.notices.state === "unavailable" && <li className="live-source"><div><strong>National Weather Service</strong><small>Could not be reached from Firepoint.</small></div><span className="status-tag status-down">UNAVAILABLE</span></li>}
            {done.context.state === "unavailable" && <li className="live-source"><div><strong>Fire and air sources</strong><small>Could not be reached from Firepoint.</small></div><span className="status-tag status-down">UNAVAILABLE</span></li>}
            {done.hazards.state === "unavailable" && <li className="live-source"><div><strong>Glendale hazard maps</strong><small>Could not be reached from Firepoint.</small></div><span className="status-tag status-down">UNAVAILABLE</span></li>}
          </ul>

          {notices.length > 0 && <section className="live-group" aria-label="Weather alerts">
            <h4>Weather alerts from NWS</h4>
            <ul>{notices.map((notice) => <li key={notice.origin.recordId} className="live-item">
              <strong>{notice.headline}</strong>
              {notice.areaDescription && <small>{notice.areaDescription}</small>}
              <small>Issued {formatTime(notice.origin.issuedAt)} · {sourceLink(notice.origin.recordUrl, "Read the full alert")}</small>
            </li>)}</ul>
          </section>}

          {context && context.incidents.length > 0 && <section className="live-group" aria-label="Fire incidents">
            <h4>Fire incidents within {context.radiusKm} km, from CAL FIRE</h4>
            <ul>{context.incidents.map((incident) => <li key={incident.origin.recordId} className="live-item">
              <strong>{incident.name}</strong>
              <small>About {incident.distanceKm} km away{incident.county ? ` · ${incident.county} County` : ""}
                {incident.acresBurned !== null ? ` · ${incident.acresBurned.toLocaleString()} acres reported` : ""}
                {incident.percentContained !== null ? ` · ${incident.percentContained}% contained` : ""}</small>
              <small>Updated {formatTime(incident.origin.updatedAt)} · {sourceLink(incident.origin.recordUrl, "CAL FIRE incident page")}</small>
            </li>)}</ul>
            <p className="live-caveat">{context.incidents[0]?.caveat}</p>
          </section>}

          {context && context.perimeters.length > 0 && <section className="live-group" aria-label="Fire perimeters">
            <h4>Mapped fire perimeters nearby, from NIFC</h4>
            <ul>{context.perimeters.map((perimeter) => <li key={perimeter.origin.recordId} className="live-item">
              <strong>{perimeter.incidentName}{perimeter.incidentType === "prescribed" ? " (prescribed burn)" : ""}</strong>
              <small>{perimeter.gisAcres !== null ? `${perimeter.gisAcres.toLocaleString()} mapped acres · ` : ""}Perimeter mapped {formatTime(perimeter.polygonCapturedAt)}</small>
              <small>{sourceLink(perimeter.origin.recordUrl, "NIFC record")}</small>
            </li>)}</ul>
            <p className="live-caveat">{context.perimeters[0]?.caveat}</p>
          </section>}

          {context && context.airQuality.length > 0 && <section className="live-group" aria-label="Air quality">
            <h4>Air quality from AirNow</h4>
            <ul>{context.airQuality.map((reading) => <li key={reading.origin.recordId} className="live-item">
              <strong>{reading.pollutant}: AQI {reading.aqi}{reading.category ? ` (${reading.category})` : ""}</strong>
              <small>{reading.reportingArea} · observed {formatTime(reading.observedAt)} · {sourceLink("https://www.airnow.gov/", "AirNow")}</small>
            </li>)}</ul>
            <p className="live-caveat">{context.airQuality[0]?.caveat}</p>
          </section>}

          {hazardFeed && hazardFeed.hazards.some((h) => h.lookup !== "unavailable") && <section className="live-group" aria-label="Mapped hazard zones">
            <h4>Mapped hazard zones (reference maps, not current conditions)</h4>
            <ul>{hazardFeed.hazards.map((hazard) => <li key={hazard.hazard} className="live-item">
              <strong>{HAZARD_LABEL[hazard.hazard]}: {hazardStatus(hazard)}</strong>
              <small>{hazard.dataset}{hazard.origin.issuer ? ` · ${hazard.origin.issuer}` : ""}{hazard.origin.updatedAt ? ` · map edited ${formatDate(hazard.origin.updatedAt)}` : ""} · {sourceLink(hazard.origin.recordUrl, "Source layer")}</small>
              <small>{hazard.caveat}</small>
            </li>)}</ul>
            <p className="live-caveat">From the Glendale GIS snapshot of {formatTime(hazardFeed.sourceChecks[0]?.sourceAsOf)}. These regulatory maps describe long-term mapped hazard, not today’s conditions, your evacuation zone, or whether a building is safe.</p>
          </section>}
        </div>}
      </div>
    </div>
  );
}
