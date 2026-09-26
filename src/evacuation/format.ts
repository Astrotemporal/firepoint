import type { LatLng } from "./types";

const METERS_PER_MILE = 1609.344;
const FEET_PER_METER = 3.28084;
const DIRECTIONS = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"] as const;
export type CompassDirection = (typeof DIRECTIONS)[number];

/** Unit abbreviations for displayed distances and times; English unless a translation passes its own. */
export type Units = { mi: string; ft: string; min: string; h: string };
export const UNITS_EN: Units = { mi: "mi", ft: "ft", min: "min", h: "h" };

export function formatMiles(meters: number, units: Units = UNITS_EN): string {
  const miles = meters / METERS_PER_MILE;
  if (miles < 0.1) return `<0.1 ${units.mi}`;
  return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} ${units.mi}`;
}

/** Short distances in feet (rounded to 50), longer ones in miles. */
export function formatShortDistance(meters: number, units: Units = UNITS_EN): string {
  if (meters / METERS_PER_MILE >= 0.1) return formatMiles(meters, units);
  return `${Math.max(50, Math.round((meters * FEET_PER_METER) / 50) * 50).toLocaleString("en-US")} ${units.ft}`;
}

export function formatDuration(seconds: number, units: Units = UNITS_EN): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} ${units.min}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} ${units.h} ${rest} ${units.min}` : `${hours} ${units.h}`;
}

/** Eight-point compass word for a bearing, e.g. 44° → "northeast". */
export function compassDirection(bearingDegrees: number): (typeof DIRECTIONS)[number] {
  const normalized = ((bearingDegrees % 360) + 360) % 360;
  return DIRECTIONS[Math.round(normalized / 45) % 8];
}

type NavigatorLike = { userAgent: string; platform?: string; maxTouchPoints?: number };

/** iPhone, iPod, or iPad (iPadOS reports itself as a touch-capable Mac). */
export function isAppleMobile(nav: NavigatorLike): boolean {
  if (/Android/.test(nav.userAgent)) return false;
  return /iPad|iPhone|iPod/.test(nav.userAgent) || (nav.platform === "MacIntel" && (nav.maxTouchPoints ?? 0) > 1);
}

/**
 * Native maps deep link with the destination only; the maps app starts from its own
 * current location, so Firepoint never puts the person's position in this URL.
 */
export function directionsUrl(to: LatLng, appleMaps: boolean): string {
  const destination = `${to.lat.toFixed(6)},${to.lng.toFixed(6)}`;
  return appleMaps
    ? `https://maps.apple.com/?daddr=${destination}&dirflg=d`
    : `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`;
}
