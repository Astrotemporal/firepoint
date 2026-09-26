import type { GetRoute, Hazard, LatLng, Route, SafeZone, Shelter } from "./types";

/*
 * Pure routing decisions. Network access only happens through an injected GetRoute, so every
 * function here is deterministic under test. Distances are meters; bearings are degrees
 * clockwise from true north.
 */

const EARTH_RADIUS_METERS = 6_371_008.8;
/** Shelters and escape points this close to a hazard's edge are not destinations. */
export const DESTINATION_HAZARD_BUFFER_METERS = 1_000;
/** Routes may not pass this close to a hazard's edge. */
export const ROUTE_HAZARD_BUFFER_METERS = 500;
/** Driving routes requested per round of shelter candidates. */
export const SHELTER_ROUTE_BATCH = 3;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const toDegrees = (radians: number) => (radians * 180) / Math.PI;

/** Great-circle distance in meters. */
export function haversine(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial great-circle bearing from `from` to `to`, 0–360°. */
export function bearing(from: LatLng, to: LatLng): number {
  const φ1 = toRadians(from.lat);
  const φ2 = toRadians(to.lat);
  const Δλ = toRadians(to.lng - from.lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

/** Smallest angle between two bearings, 0–180°. */
export function angularDifference(a: number, b: number): number {
  const difference = Math.abs(a - b) % 360;
  return difference > 180 ? 360 - difference : difference;
}

export function pointInHazard(point: LatLng, hazard: Hazard, bufferMeters = 0): boolean {
  return haversine(point, hazard.center) <= hazard.radiusMeters + bufferMeters;
}

/** Nearest hazard by distance to its edge (negative when inside). */
export function nearestHazard(point: LatLng, hazards: readonly Hazard[]): { hazard: Hazard; edgeMeters: number } | null {
  let nearest: { hazard: Hazard; edgeMeters: number } | null = null;
  for (const hazard of hazards) {
    const edgeMeters = haversine(point, hazard.center) - hazard.radiusMeters;
    if (!nearest || edgeMeters < nearest.edgeMeters) nearest = { hazard, edgeMeters };
  }
  return nearest;
}

export type RouteHazardOptions = {
  bufferMeters?: number;
  /** Maximum spacing between checked points along each segment. */
  sampleMeters?: number;
  /** Where the trip starts; defaults to the first path point. */
  origin?: LatLng;
  /** Allowed approach toward a hazard when the trip already starts inside its buffer. */
  approachToleranceMeters?: number;
};

/**
 * True when a sampled point along the path comes within hazard radius + buffer. If the trip
 * starts inside that buffered area, every route would "intersect", so for that hazard the route
 * is rejected only when it leads meaningfully closer to the center than the start: routes that
 * lead out of the danger area stay usable.
 */
export function routeIntersectsHazard(
  path: readonly LatLng[],
  hazards: readonly Hazard[],
  { bufferMeters = ROUTE_HAZARD_BUFFER_METERS, sampleMeters = 25, origin = path[0], approachToleranceMeters = 100 }: RouteHazardOptions = {},
): boolean {
  if (path.length === 0 || hazards.length === 0) return false;
  const limits = hazards.map((hazard) => {
    const buffered = hazard.radiusMeters + bufferMeters;
    const start = origin ? haversine(origin, hazard.center) : Infinity;
    return { center: hazard.center, limit: start <= buffered ? Math.max(0, start - approachToleranceMeters) : buffered };
  });
  if (path.length === 1) return limits.some(({ center, limit }) => haversine(path[0], center) < limit);

  for (let index = 1; index < path.length; index++) {
    const a = path[index - 1];
    const b = path[index];
    const length = haversine(a, b);
    const samples = Math.max(1, Math.ceil(length / sampleMeters));
    for (const { center, limit } of limits) {
      // Triangle inequality: no point on this segment can be closer than this.
      if (haversine(a, center) - length >= limit) continue;
      for (let step = 0; step <= samples; step++) {
        const t = step / samples;
        const point = { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
        if (haversine(point, center) < limit) return true;
      }
    }
  }
  return false;
}

/** Point reached by traveling `meters` from `from` along a great circle at `bearingDegrees`. */
export function destinationPoint(from: LatLng, bearingDegrees: number, meters: number): LatLng {
  const δ = meters / EARTH_RADIUS_METERS;
  const θ = toRadians(bearingDegrees);
  const φ1 = toRadians(from.lat);
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = toRadians(from.lng) +
    Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return { lat: toDegrees(φ2), lng: ((toDegrees(λ2) + 540) % 360) - 180 };
}

export type Heading =
  | { toward: "target"; bearing: number }
  | { toward: "away-from-hazard"; bearing: number; hazard: Hazard };

/**
 * Straight-line escape guidance when no road route is usable: toward the target if that line
 * stays clear of hazards, otherwise directly away from the nearest hazard. A compass arrow must
 * never point people across the hazard they are escaping.
 */
export function escapeHeading(origin: LatLng, target: LatLng, hazards: readonly Hazard[]): Heading {
  const threat = nearestHazard(origin, hazards);
  if (!threat || !routeIntersectsHazard([origin, target], hazards, { origin })) {
    return { toward: "target", bearing: bearing(origin, target) };
  }
  return { toward: "away-from-hazard", bearing: (bearing(origin, threat.hazard.center) + 180) % 360, hazard: threat.hazard };
}

/** A route and its alternatives that stay clear of every hazard, fastest first. */
export function clearRoutes(route: Route, hazards: readonly Hazard[], origin: LatLng): Route[] {
  return [route, ...(route.alternatives ?? [])]
    .filter((candidate) => !routeIntersectsHazard(candidate.path, hazards, { origin }))
    .sort((a, b) => a.durationSeconds - b.durationSeconds);
}

export function isShelterAvailable(shelter: Shelter): boolean {
  if (shelter.status !== "open") return false;
  if (shelter.capacity === null || shelter.currentOccupancy === null) return true;
  return shelter.currentOccupancy < shelter.capacity;
}

/** Open, not-full shelters outside every hazard's destination buffer, nearest first (straight line). */
export function rankShelters(
  origin: LatLng,
  shelters: readonly Shelter[],
  hazards: readonly Hazard[],
): Array<{ shelter: Shelter; meters: number }> {
  return shelters
    .filter((shelter) => isShelterAvailable(shelter) &&
      !hazards.some((hazard) => pointInHazard(shelter, hazard, DESTINATION_HAZARD_BUFFER_METERS)))
    .map((shelter) => ({ shelter, meters: haversine(origin, shelter) }))
    .sort((a, b) => a.meters - b.meters);
}

export type ShelterPick =
  | { kind: "route"; shelter: Shelter; route: Route }
  /** Routes came back, but every one passed too close to a hazard. */
  | { kind: "no-safe-route"; nearest: Shelter }
  /** No driving route could be fetched; guide by straight line instead. */
  | { kind: "routing-unavailable"; shelter: Shelter; reason: "offline" | "provider-error" }
  /** Nothing open, available, and away from hazards. */
  | { kind: "no-shelter" };

type RouteOptions = { signal?: AbortSignal };

/**
 * Nearest usable shelter by driving time. Candidates are ranked by straight-line distance and
 * routed in batches of three; the fastest route (or provider alternative) that stays clear of
 * hazards wins. A later batch is only tried when every route in the earlier one was rejected or failed.
 */
export async function pickShelter(
  origin: LatLng,
  shelters: readonly Shelter[],
  hazards: readonly Hazard[],
  getRoute: GetRoute,
  { signal }: RouteOptions = {},
): Promise<ShelterPick> {
  const ranked = rankShelters(origin, shelters, hazards);
  if (ranked.length === 0) return { kind: "no-shelter" };
  let anyRouted = false;
  for (let start = 0; start < ranked.length; start += SHELTER_ROUTE_BATCH) {
    const batch = ranked.slice(start, start + SHELTER_ROUTE_BATCH);
    const results = await Promise.allSettled(batch.map(({ shelter }) => getRoute(origin, shelter, { signal })));
    signal?.throwIfAborted();
    let best: { shelter: Shelter; route: Route } | null = null;
    for (const [index, result] of results.entries()) {
      if (result.status !== "fulfilled") continue;
      anyRouted = true;
      const route = clearRoutes(result.value, hazards, origin)[0];
      if (!route) continue;
      if (!best || route.durationSeconds < best.route.durationSeconds) best = { shelter: batch[index].shelter, route };
    }
    if (best) return { kind: "route", ...best };
  }
  return anyRouted
    ? { kind: "no-safe-route", nearest: ranked[0].shelter }
    : { kind: "routing-unavailable", shelter: ranked[0].shelter, reason: "provider-error" };
}

export type EscapeCandidate = {
  zone: SafeZone;
  bearing: number;
  meters: number;
  /** Angle between this zone and the nearest hazard as seen from the origin; null without hazards. */
  separation: number | null;
  /** The zone itself sits within a hazard's destination buffer. */
  compromised: boolean;
};

/**
 * Escape points ordered best first: zones clear of hazards, then those whose bearing differs most
 * from the bearing to the nearest hazard (ties: farther from it). Without hazards, primary first.
 */
export function rankEscapePoints(origin: LatLng, zones: readonly SafeZone[], hazards: readonly Hazard[]): EscapeCandidate[] {
  const threat = nearestHazard(origin, hazards)?.hazard ?? null;
  const hazardBearing = threat ? bearing(origin, threat.center) : null;
  return zones
    .map((zone) => {
      const zoneBearing = bearing(origin, zone);
      return {
        zone,
        bearing: zoneBearing,
        meters: haversine(origin, zone),
        separation: hazardBearing === null ? null : angularDifference(zoneBearing, hazardBearing),
        compromised: hazards.some((hazard) => pointInHazard(zone, hazard, DESTINATION_HAZARD_BUFFER_METERS)),
      };
    })
    .sort((a, b) => {
      if (a.compromised !== b.compromised) return a.compromised ? 1 : -1;
      if (threat) {
        return (b.separation ?? 0) - (a.separation ?? 0) ||
          haversine(b.zone, threat.center) - haversine(a.zone, threat.center);
      }
      return (a.zone.priority === b.zone.priority ? 0 : a.zone.priority === "primary" ? -1 : 1) || a.meters - b.meters;
    });
}

export function pickEscapePoint(origin: LatLng, zones: readonly SafeZone[], hazards: readonly Hazard[]): SafeZone | null {
  return rankEscapePoints(origin, zones, hazards)[0]?.zone ?? null;
}

export type EscapePick =
  | { kind: "route"; zone: SafeZone; route: Route }
  /** Every driving route found passed too close to a hazard. */
  | { kind: "no-safe-route"; zone: SafeZone }
  | { kind: "routing-unavailable"; zone: SafeZone; reason: "offline" | "provider-error" }
  | { kind: "no-zone" }
  /** The user hasn't asked for an escape route yet; nothing was computed. */
  | { kind: "not-requested" };

/** Tries escape points in rank order and returns the first route (or alternative) clear of hazards. */
export async function pickEscapeRoute(
  origin: LatLng,
  zones: readonly SafeZone[],
  hazards: readonly Hazard[],
  getRoute: GetRoute,
  { signal }: RouteOptions = {},
): Promise<EscapePick> {
  const ranked = rankEscapePoints(origin, zones, hazards);
  if (ranked.length === 0) return { kind: "no-zone" };
  let anyRouted = false;
  for (const { zone } of ranked) {
    let route: Route;
    try {
      route = await getRoute(origin, zone, { signal });
    } catch (error) {
      if (signal?.aborted) throw error;
      continue;
    }
    anyRouted = true;
    const clear = clearRoutes(route, hazards, origin)[0];
    if (clear) return { kind: "route", zone, route: clear };
  }
  return anyRouted
    ? { kind: "no-safe-route", zone: ranked[0].zone }
    : { kind: "routing-unavailable", zone: ranked[0].zone, reason: "provider-error" };
}
