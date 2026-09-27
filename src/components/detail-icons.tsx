import type { ReactNode } from "react";
import type { Turn } from "@/evacuation/types";

/** Outline icons for the directions drawer's details, in the spirit of SF Symbols; they take the text color. */
const ICONS = {
  pin: <><path d="M12 21.5s-7-7.2-7-12.3a7 7 0 0 1 14 0c0 5.1-7 12.3-7 12.3z" /><circle cx="12" cy="9.2" r="2.6" /></>,
  flag: <path d="M5.5 21V4m0 0h11.5l-2.5 4.2 2.5 4.3H5.5" />,
  warning: <><path d="M10.3 4.2 2.6 17.8A2 2 0 0 0 4.3 20.8h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z" /><path d="M12 9.5v4.2" /><circle cx="12" cy="17" r=".6" fill="currentColor" /></>,
  paw: <><path d="M12 13c-2.5 0-5 3-5 5.2 0 1.4 1 2.1 2.3 2.1 1.1 0 1.7-.6 2.7-.6s1.6.6 2.7.6c1.3 0 2.3-.7 2.3-2.1 0-2.2-2.5-5.2-5-5.2z" /><ellipse cx="6" cy="11" rx="1.7" ry="2.1" /><ellipse cx="9.5" cy="6.6" rx="1.7" ry="2.2" /><ellipse cx="14.5" cy="6.6" rx="1.7" ry="2.2" /><ellipse cx="18" cy="11" rx="1.7" ry="2.1" /></>,
  accessible: <><circle cx="12" cy="4.5" r="1.8" /><path d="M5 8.5c2.3.7 4.6 1 7 1s4.7-.3 7-1M12 9.5v4.5m0 0-3 7m3-7 3 7" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5" /><circle cx="12" cy="7.8" r=".6" fill="currentColor" /></>,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof ICONS;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg className={`ev-icon ev-icon-${name}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {ICONS[name]}
    </svg>
  );
}

const TURN_ANGLE: Partial<Record<Turn, number>> = {
  depart: 0, straight: 0, "slight-right": 45, right: 90, "sharp-right": 135, "slight-left": -45, left: -90, "sharp-left": -135,
};

/** A step's maneuver arrow (pointing the way to turn), a U-turn hook, or a flag on arrival; a dot when Mapbox gave no turn. */
export function TurnIcon({ turn }: { turn?: Turn }) {
  const angle = turn ? TURN_ANGLE[turn] : undefined;
  return (
    <svg className="ev-step-icon" data-turn={turn ?? "none"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {turn === "arrive" ? ICONS.flag
        : turn === "uturn" ? <path d="M8 20V10a4 4 0 0 1 8 0v7m-3.5-3.5L16 17l3.5-3.5" />
        : angle !== undefined ? <path d="M12 20V5m-6 6 6-6 6 6" transform={`rotate(${angle} 12 12)`} />
        : <circle cx="12" cy="12" r="3" fill="currentColor" />}
    </svg>
  );
}
