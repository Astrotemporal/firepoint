"use client";

import type { ReactNode } from "react";
import { Icon, TurnIcon } from "./detail-icons";
import { useMapText } from "./map-text";
import { compassDirection, formatDuration, formatMiles, formatShortDistance } from "@/evacuation/format";
import type { LocationState } from "@/evacuation/location";
import type { NavState } from "@/evacuation/navigation";

/**
 * In-app turn-by-turn guidance (routing prototype only): the next maneuver across the top, trip time,
 * distance, arrival time and End across the bottom. Replaces the directions drawer while navigating.
 * Guidance is only as good as the provider's route and the prototype's unverified data, which the card says.
 */
export function NavigationPanel({ state, location, onEnd, now = Date.now }: {
  state: NavState;
  location: LocationState;
  onEnd: () => void;
  now?: () => number;
}) {
  const t = useMapText();
  const { target, status, route, progress, straight } = state;
  if (!target) return null;
  const noLocation = location.status === "fallback" && location.reason !== "prompt";
  const following = route !== null && progress !== null;

  let banner: { icon: ReactNode; distance: string | null; text: string };
  if (status === "arrived") {
    banner = { icon: <TurnIcon turn="arrive" />, distance: null, text: t.navArrived(target.name) };
  } else if (status === "waiting-for-gps") {
    banner = { icon: <Icon name="pin" />, distance: null, text: noLocation ? t.navNeedsLocation : t.navWaitingForGps };
  } else if (following && progress.next) {
    banner = {
      icon: <TurnIcon turn={progress.next.step.turn} />,
      distance: formatShortDistance(progress.next.distanceMeters, t.units),
      text: progress.next.step.instruction,
    };
  } else if (following) {
    banner = { icon: <TurnIcon turn="arrive" />, distance: formatShortDistance(progress.remainingMeters, t.units), text: t.navTo(target.name) };
  } else if (straight) {
    banner = {
      icon: <StraightArrow heading={straight.headingDegrees} />,
      distance: null,
      text: t.navStraight(t.compass[compassDirection(straight.headingDegrees)], formatMiles(straight.meters, t.units)),
    };
  } else {
    banner = { icon: <Icon name="pin" />, distance: null, text: t.navRerouting };
  }
  // Announce each new maneuver once, not every GPS tick.
  const announcement = [banner.text, status === "rerouting" ? t.navRerouting : ""].filter(Boolean).join(" ");

  const remainingSeconds = following ? progress.remainingSeconds : null;
  const remainingMeters = following ? progress.remainingMeters : straight?.meters ?? null;
  const arrival = remainingSeconds !== null
    ? new Date(now() + remainingSeconds * 1000).toLocaleTimeString(t.clockLocale, { hour: "numeric", minute: "2-digit" })
    : null;

  return (
    <section className={`ev-nav ev-nav-${target.kind}`} aria-label={t.navTo(target.name)}>
      <div className={`ev-nav-banner${status === "arrived" ? " ev-nav-banner-done" : ""}`}>
        <span className="ev-nav-turn" aria-hidden="true">{banner.icon}</span>
        <div className="ev-nav-instruction">
          {banner.distance && <strong className="ev-nav-distance">{banner.distance}</strong>}
          <span className="ev-nav-text">{banner.text}</span>
          {status === "rerouting" && following && <span className="ev-nav-status">{t.navRerouting}</span>}
        </div>
      </div>
      <p className="ev-sr-only" aria-live="polite">{announcement}</p>

      <div className="ev-nav-card">
        <div className="ev-nav-trip">
          <div className="ev-nav-summary">
            {remainingSeconds !== null && <strong>{formatDuration(remainingSeconds, t.units)}</strong>}
            {remainingMeters !== null && <span>{formatMiles(remainingMeters, t.units)}</span>}
            {arrival && <span>{t.navArrive(arrival)}</span>}
          </div>
          <span className="ev-nav-destination">{t.navTo(target.name)}</span>
        </div>
        <button type="button" className="ev-nav-end" onClick={onEnd} aria-label={t.navEndLabel}>{t.navEnd}</button>
        {state.nearHazard && <p className="ev-nav-note ev-danger-text">{t.navNearHazard}</p>}
        {!route && status !== "waiting-for-gps" && status !== "arrived" && <p className="ev-nav-note">{t.navNoRoadRoute}</p>}
        {state.rerouteFailed && route && <p className="ev-nav-note">{t.navRerouteFailed}</p>}
        <p className="ev-nav-note ev-nav-caution">{t.navCaution}</p>
      </div>
    </section>
  );
}

/** North-up arrow toward the destination for straight-line guidance. */
function StraightArrow({ heading }: { heading: number }) {
  return (
    <svg className="ev-step-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={{ transform: `rotate(${heading}deg)` }}>
      <path d="M12 3 L18.5 20 L12 16 L5.5 20 Z" fill="currentColor" />
    </svg>
  );
}
