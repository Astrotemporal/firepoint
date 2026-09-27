import { angularDifference, bearing, destinationPoint, haversine, nearestHazard, routeIntersectsHazard } from "./routing";
import type { GetRoute, Hazard, LatLng, Route } from "./types";
import type { WildlandIndex } from "./wildland";

/*
 * Escape routing: the fastest road route out of the fire zone, ending at an escape mark just outside it.
 * The mark is not a shelter or a named place, only the nearest safety the person can reach.
 *
 * The fire zone is everything within SAFE_DISTANCE_METERS (1 mile, how far embers commonly carry) of a recorded
 * fire's edge. Outside it counts as safe.
 *
 * 1. Candidate marks. From the person, 16 compass rays are walked in 100 m steps. On each, the first point
 *    outside the fire zone (pushed 300 m further, so snapping to a road rarely pulls it back in) is a candidate.
 *    When that spot is in CAL FIRE's mapped high-hazard hills and flat ground outside the zone is within another
 *    kilometer, the mark slides there instead: nobody should be told to stop in the brush. A ray that meets the fire
 *    first, coming within 500 m of its edge (or closer than the start, when the trip begins that near), is dropped,
 *    so a mark on the far side of the fire is never offered.
 * 2. Road routes. Five candidates, nearest first and each at least 45° from the others (so, in practice, every
 *    usable direction out), are routed by road like a shelter, with the provider's alternatives. A route ends where
 *    the provider snapped the mark onto a road, and that road point becomes the escape mark.
 * 3. Choice. Routes that pass within 500 m of a fire, or whose road end is still inside the fire zone, are dropped.
 *    The rest are ranked by the time until they leave the fire zone for good (the rest of the drive counts a
 *    fifth); arriving on a freeway costs 10 minutes, since nobody can stop there. Only when a round yields nothing
 *    usable are the remaining candidates tried.
 *
 * No straight-line guidance is ever drawn across the map: without a road route the drawer names a direction.
 * Distances are meters, times seconds, bearings degrees clockwise from true north. Pure except for the injected
 * GetRoute, so everything here is deterministic under test.
 */

/** Beyond this distance from every fire's edge, a point is out of the fire zone. */
export const SAFE_DISTANCE_METERS = 1_609;
const RAY_COUNT = 16;
const RAY_STEP_METERS = 100;
/** No candidate farther than this: a way out should be nearby. */
const MAX_SEARCH_METERS = 15_000;
/** Candidates sit this far past the fire zone's edge. */
const MARK_MARGIN_METERS = 300;
/** How much farther along a ray to look for flat ground when the first safe point is in the hills. */
const HILLS_LOOKAHEAD_METERS = 1_000;
/** The road end may fall this far short of the safe distance (provider snapping). */
const SNAP_TOLERANCE_METERS = 300;
const MIN_SPREAD_DEGREES = 45;
/** Candidates routed per round, and rounds tried (at most ten Directions requests, usually five). */
export const ESCAPE_ROUTE_BATCH = 5;
const MAX_ESCAPE_ROUNDS = 2;
const PATH_SAMPLE_METERS = 50;
/** The drive after leaving the fire zone still counts, a little. */
const AFTER_SAFETY_WEIGHT = 0.2;
const MOTORWAY_ARRIVAL_PENALTY_SECONDS = 600;

export type EscapeContext = {
  hazards: readonly Hazard[];
  /** Mapped High/Very High wildland, used only to keep marks out of the brush; null or absent skips it. */
  wildland?: WildlandIndex | null;
};

/** The nearest fire and the distance to its edge (negative inside it). */
export type Threat = { hazard: Hazard; edgeMeters: number };

export type EscapeMark = LatLng & {
  /** Straight-line meters from the start. */
  meters: number;
  /** Distance from the nearest fire's edge. */
  fireMeters: number;
};

export type EscapePick =
  | {
      kind: "route"; mark: EscapeMark; route: Route; threat: Threat;
      /** Driving time until the route leaves the fire zone for good. */
      secondsToSafety: number;
    }
  /** The start is already outside the fire zone. */
  | { kind: "already-safe"; threat: Threat }
  /** No fire is recorded, so there is nothing to escape from. */
  | { kind: "no-fire" }
  /** Road routing failed or the device is offline; the best candidate mark, without a road route. */
  | { kind: "routing-unavailable"; mark: EscapeMark; reason: "offline" | "provider-error"; threat: Threat }
  /** Every road route passed the fire, or every direction meets the fire first. `bearing` points away from it. */
  | { kind: "no-safe-route"; bearing: number; threat: Threat }
  /** The user hasn't asked for an escape route yet; nothing was computed. */
  | { kind: "not-requested" };

/** Farther than the safe distance from every fire's edge. */
export function outsideFireZone(point: LatLng, hazards: readonly Hazard[]): boolean {
  const threat = nearestHazard(point, hazards);
  return !threat || threat.edgeMeters >= SAFE_DISTANCE_METERS;
}

/** Directly away from the fires, the nearest weighing most (inverse square of the distance to its edge). */
export function awayBearing(origin: LatLng, hazards: readonly Hazard[]): number {
  let east = 0;
  let north = 0;
  for (const hazard of hazards) {
    const away = (bearing(hazard.center, origin) * Math.PI) / 180;
    const weight = 1 / Math.max(250, haversine(origin, hazard.center) - hazard.radiusMeters) ** 2;
    east += weight * Math.sin(away);
    north += weight * Math.cos(away);
  }
  return ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360;
}

function toMark(origin: LatLng, point: LatLng, hazards: readonly Hazard[]): EscapeMark {
  return {
    lat: point.lat,
    lng: point.lng,
    meters: haversine(origin, point),
    fireMeters: nearestHazard(point, hazards)?.edgeMeters ?? Infinity,
  };
}

/**
 * Candidate escape marks, one per compass ray that leaves the fire zone without meeting the fire. Nearest first,
 * to the ray step; ties go to the one pointing most directly away from the fire.
 */
export function candidateMarks(origin: LatLng, { hazards, wildland }: EscapeContext): EscapeMark[] {
  const usable = (point: LatLng) => outsideFireZone(point, hazards) && !routeIntersectsHazard([point], hazards, { origin });
  const inHills = (point: LatLng) => Boolean(wildland?.severityAt(point));
  const marks: EscapeMark[] = [];
  for (let ray = 0; ray < RAY_COUNT; ray++) {
    const rayBearing = (ray * 360) / RAY_COUNT;
    const at = (meters: number) => destinationPoint(origin, rayBearing, meters);
    for (let meters = RAY_STEP_METERS; meters <= MAX_SEARCH_METERS; meters += RAY_STEP_METERS) {
      const point = at(meters);
      if (routeIntersectsHazard([point], hazards, { origin })) break;
      if (!outsideFireZone(point, hazards)) continue;
      // The mark sits a margin past the exit; if that spot is in the hills, slide it to flat ground within a kilometer.
      let markAt = meters + MARK_MARGIN_METERS;
      if (inHills(at(markAt))) {
        for (let ahead = markAt + RAY_STEP_METERS; ahead <= markAt + HILLS_LOOKAHEAD_METERS; ahead += RAY_STEP_METERS) {
          if (!usable(at(ahead))) break;
          if (!inHills(at(ahead))) { markAt = ahead; break; }
        }
      }
      marks.push(toMark(origin, usable(at(markAt)) ? at(markAt) : point, hazards));
      break;
    }
  }
  const away = awayBearing(origin, hazards);
  const deviation = (mark: EscapeMark) => angularDifference(bearing(origin, mark), away);
  return marks.sort((a, b) =>
    Math.round(a.meters / RAY_STEP_METERS) - Math.round(b.meters / RAY_STEP_METERS) || deviation(a) - deviation(b));
}

/** Nearest first, but each pick at least 45° from the ones before it, so each round covers different roads. */
function spreadOrder(origin: LatLng, marks: readonly EscapeMark[]): EscapeMark[] {
  const left = [...marks];
  const ordered: EscapeMark[] = [];
  while (left.length) {
    const index = left.findIndex((candidate) => ordered.every((picked) =>
      // Rays are exact multiples of 22.5°, but bearings between computed points drift by a hair.
      angularDifference(bearing(origin, candidate), bearing(origin, picked)) >= MIN_SPREAD_DEGREES - 0.5));
    ordered.push(...left.splice(index < 0 ? 0 : index, 1));
  }
  return ordered;
}

/** Share of the route's driving time spent before it leaves the fire zone for good (time split by distance). */
export function secondsToSafety(route: Route, hazards: readonly Hazard[]): number {
  let traveled = 0;
  let exitAt = 0;
  for (let index = 1; index < route.path.length; index++) {
    const a = route.path[index - 1];
    const b = route.path[index];
    const length = haversine(a, b);
    const samples = Math.max(1, Math.ceil(length / PATH_SAMPLE_METERS));
    for (let step = 1; step <= samples; step++) {
      const t = step / samples;
      if (!outsideFireZone({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t }, hazards)) {
        exitAt = traveled + length * t;
      }
    }
    traveled += length;
  }
  return traveled > 0 ? (route.durationSeconds * exitAt) / traveled : 0;
}

type Scored = { mark: EscapeMark; route: Route; secondsToSafety: number; score: number };

/** The route and its road end, when usable as an escape: clear of every fire, ending outside the fire zone. */
function scoreRoute(route: Route, origin: LatLng, hazards: readonly Hazard[]): Scored | null {
  if (routeIntersectsHazard(route.path, hazards, { origin })) return null;
  const end = route.path.at(-1);
  if (!end) return null;
  const mark = toMark(origin, end, hazards);
  if (mark.fireMeters < SAFE_DISTANCE_METERS - SNAP_TOLERANCE_METERS) return null;
  const toSafety = secondsToSafety(route, hazards);
  const score = toSafety + AFTER_SAFETY_WEIGHT * (route.durationSeconds - toSafety) +
    (route.arrivesOnMotorway ? MOTORWAY_ARRIVAL_PENALTY_SECONDS : 0);
  return { mark, route, secondsToSafety: toSafety, score };
}

/** The fastest road route out of the fire zone, to an escape mark just outside it (see the module comment). */
export async function pickEscapeRoute(
  origin: LatLng,
  context: EscapeContext,
  getRoute: GetRoute,
  { signal }: { signal?: AbortSignal } = {},
): Promise<EscapePick> {
  const { hazards } = context;
  const threat = nearestHazard(origin, hazards);
  if (!threat) return { kind: "no-fire" };
  if (outsideFireZone(origin, hazards)) return { kind: "already-safe", threat };
  const marks = spreadOrder(origin, candidateMarks(origin, context));
  if (marks.length === 0) return { kind: "no-safe-route", bearing: awayBearing(origin, hazards), threat };

  let anyRouted = false;
  const limit = Math.min(marks.length, ESCAPE_ROUTE_BATCH * MAX_ESCAPE_ROUNDS);
  for (let start = 0; start < limit; start += ESCAPE_ROUTE_BATCH) {
    const round = marks.slice(start, Math.min(start + ESCAPE_ROUTE_BATCH, limit));
    const results = await Promise.allSettled(round.map((candidate) => getRoute(origin, candidate, { signal })));
    signal?.throwIfAborted();
    let best: Scored | null = null;
    for (const result of results) {
      if (result.status !== "fulfilled") continue;
      anyRouted = true;
      const { alternatives = [], ...primary } = result.value;
      for (const route of [primary, ...alternatives]) {
        const scored = scoreRoute(route, origin, hazards);
        if (scored && (!best || scored.score < best.score)) best = scored;
      }
    }
    if (best) return { kind: "route", mark: best.mark, route: best.route, threat, secondsToSafety: best.secondsToSafety };
  }
  return anyRouted
    ? { kind: "no-safe-route", bearing: awayBearing(origin, hazards), threat }
    : { kind: "routing-unavailable", mark: marks[0], reason: "provider-error", threat };
}

/** Offline: no road routing, so the nearest candidate mark for the drawer to name a direction to. */
export function offlineEscape(origin: LatLng, context: EscapeContext): EscapePick {
  const { hazards } = context;
  const threat = nearestHazard(origin, hazards);
  if (!threat) return { kind: "no-fire" };
  if (outsideFireZone(origin, hazards)) return { kind: "already-safe", threat };
  const [nearest] = candidateMarks(origin, context);
  return nearest
    ? { kind: "routing-unavailable", mark: nearest, reason: "offline", threat }
    : { kind: "no-safe-route", bearing: awayBearing(origin, hazards), threat };
}
