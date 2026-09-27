import { bearing, clearRoutes, haversine } from "./routing";
import type { GetRoute, Hazard, LatLng, Route, RouteStep } from "./types";

/*
 * In-app turn-by-turn navigation for the routing prototype. Pure progress maths (`routeProgress`) plus a
 * small external store (`Navigator`) that follows GPS fixes, detects arrival and leaving the route, and
 * re-requests directions from the current position. It shares the planner's hazard rule (`clearRoutes`),
 * but nothing here knows about fire perimeters or road closures: the UI must say so.
 */

/** Farther than this from the route line counts as off it (widened by the fix's own accuracy). */
export const OFF_ROUTE_METERS = 50;
/** This close to the destination, or with this little route left, counts as arrived. */
export const ARRIVAL_METERS = 40;
/** Consecutive off-route fixes needed before rerouting (one bad fix is often GPS noise). */
const OFF_ROUTE_FIXES = 2;
/** Minimum gap between reroute requests, so a wandering fix never floods the directions provider. */
export const REROUTE_INTERVAL_MS = 10_000;
/** A maneuver this close behind us is treated as done. */
const PASSED_METERS = 8;

export type NavKind = "escape" | "shelter";
export type NavTarget = { kind: NavKind; name: string; destination: LatLng };

export type NavProgress = {
  /** Nearest point on the route line, and how far along the route it is. */
  snapped: LatLng;
  alongMeters: number;
  offRouteMeters: number;
  remainingMeters: number;
  remainingSeconds: number;
  /** Direction of travel along the route at the snapped point (for turning the map). */
  headingDegrees: number;
  /** The next maneuver to perform, and how far ahead it is. Null when only arrival remains. */
  next: { step: RouteStep; index: number; distanceMeters: number } | null;
};

type Geometry = { cumulative: number[]; total: number };
const geometryCache = new WeakMap<Route, Geometry>();

function geometry(route: Route): Geometry {
  let cached = geometryCache.get(route);
  if (!cached) {
    const cumulative = [0];
    for (let i = 1; i < route.path.length; i++) cumulative.push(cumulative[i - 1]! + haversine(route.path[i - 1]!, route.path[i]!));
    cached = { cumulative, total: cumulative[cumulative.length - 1] ?? 0 };
    geometryCache.set(route, cached);
  }
  return cached;
}

/** Project `point` onto segment a→b in a local flat frame (fine at street scale). Returns t in [0,1] and meters off. */
function project(point: LatLng, a: LatLng, b: LatLng): { t: number; meters: number } {
  const kx = 111_320 * Math.cos((point.lat * Math.PI) / 180);
  const ky = 110_540;
  const ax = (a.lng - point.lng) * kx, ay = (a.lat - point.lat) * ky;
  const bx = (b.lng - point.lng) * kx, by = (b.lat - point.lat) * ky;
  const dx = bx - ax, dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.min(1, Math.max(0, -(ax * dx + ay * dy) / lengthSq));
  return { t, meters: Math.hypot(ax + t * dx, ay + t * dy) };
}

/** Where `position` is along `route`: snapped point, remaining distance/time, and the next maneuver. */
export function routeProgress(route: Route, position: LatLng): NavProgress {
  const { cumulative, total } = geometry(route);
  const path = route.path;
  let best = { index: 0, t: 0, meters: Number.POSITIVE_INFINITY };
  for (let i = 0; i < path.length - 1; i++) {
    const hit = project(position, path[i]!, path[i + 1]!);
    if (hit.meters < best.meters) best = { index: i, ...hit };
  }
  const a = path[best.index]!;
  const b = path[Math.min(best.index + 1, path.length - 1)]!;
  const snapped = { lat: a.lat + (b.lat - a.lat) * best.t, lng: a.lng + (b.lng - a.lng) * best.t };
  const along = (cumulative[best.index] ?? 0) + haversine(a, snapped);
  const remaining = Math.max(0, total - along);

  // Step distances come from the provider and rarely sum exactly to our measured line; scale them to it.
  const stepTotal = route.steps.reduce((sum, step) => sum + step.distanceMeters, 0);
  const scale = stepTotal > 0 && total > 0 ? total / stepTotal : 1;
  let start = 0;
  let next: NavProgress["next"] = null;
  for (let i = 0; i < route.steps.length; i++) {
    const step = route.steps[i]!;
    // A step's instruction is the maneuver at its start; the first ("depart") is behind us once moving.
    if (i > 0 && start > along + PASSED_METERS) { next = { step, index: i, distanceMeters: start - along }; break; }
    start += step.distanceMeters * scale;
  }
  return {
    snapped,
    alongMeters: along,
    offRouteMeters: best.meters,
    remainingMeters: remaining,
    remainingSeconds: total > 0 ? route.durationSeconds * (remaining / total) : 0,
    headingDegrees: a === b ? 0 : bearing(a, b),
    next,
  };
}

export type NavStatus = "waiting-for-gps" | "navigating" | "rerouting" | "arrived";

export type NavState = {
  target: NavTarget | null;
  status: NavStatus;
  /** The road route being followed; null means straight-line guidance (offline or no route yet). */
  route: Route | null;
  progress: NavProgress | null;
  /** Latest device position used for guidance. */
  position: LatLng | null;
  /** Straight-line bearing and distance to the destination, always available. */
  straight: { headingDegrees: number; meters: number } | null;
  /** Every route the provider offered passes near a known hazard; the one shown is still the provider's first. */
  nearHazard: boolean;
  /** The last reroute attempt failed; guidance continues on the previous route or straight-line. */
  rerouteFailed: boolean;
};

const IDLE: NavState = {
  target: null, status: "waiting-for-gps", route: null, progress: null, position: null, straight: null, nearHazard: false, rerouteFailed: false,
};

export type NavigatorOptions = {
  getRoute: GetRoute;
  isOnline?: () => boolean;
  now?: () => number;
};

/**
 * Follows GPS fixes along a route. Positions stay in memory; nothing is persisted or sent anywhere except the
 * directions request itself (current position → destination), the same request the route planner already makes.
 */
export class Navigator {
  private state: NavState = IDLE;
  private readonly listeners = new Set<() => void>();
  private offRouteFixes = 0;
  private lastRerouteAt = Number.NEGATIVE_INFINITY;
  private controller: AbortController | null = null;
  private hazards: readonly Hazard[] = [];
  private readonly now: () => number;
  private readonly isOnline: () => boolean;

  constructor(private readonly options: NavigatorOptions) {
    this.now = options.now ?? Date.now;
    this.isOnline = options.isOnline ?? (() => true);
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  getSnapshot = () => this.state;

  get active(): boolean {
    return this.state.target !== null;
  }

  /** Begin guidance toward `target`, following `route` if one was planned (null → straight-line until one is fetched). */
  start(target: NavTarget, route: Route | null): void {
    this.controller?.abort();
    this.controller = null;
    this.offRouteFixes = 0;
    this.lastRerouteAt = Number.NEGATIVE_INFINITY;
    this.set({ ...IDLE, target, route });
  }

  stop(): void {
    this.controller?.abort();
    this.controller = null;
    this.set(IDLE);
  }

  /** Feed each device fix. `accuracyMeters` widens the off-route tolerance for poor fixes. */
  update(position: LatLng, accuracyMeters: number | null, hazards: readonly Hazard[]): void {
    const { target, route, status } = this.state;
    if (!target || status === "arrived") return;
    this.hazards = hazards;
    const straight = { headingDegrees: bearing(position, target.destination), meters: haversine(position, target.destination) };
    const progress = route ? routeProgress(route, position) : null;
    const arrived = straight.meters <= ARRIVAL_METERS || (progress !== null && progress.remainingMeters <= ARRIVAL_METERS / 2);
    if (arrived) {
      this.controller?.abort();
      this.set({ ...this.state, status: "arrived", position, progress, straight });
      return;
    }
    const tolerance = Math.max(OFF_ROUTE_METERS, accuracyMeters ?? 0);
    const offRoute = !progress || progress.offRouteMeters > tolerance;
    this.offRouteFixes = offRoute ? this.offRouteFixes + 1 : 0;
    // The first fix may be far from a route planned from a fallback start; reroute from it at once.
    const firstFix = this.state.position === null;
    const shouldReroute = offRoute && (firstFix || !route || this.offRouteFixes >= OFF_ROUTE_FIXES);
    this.set({
      ...this.state,
      status: status === "rerouting" ? "rerouting" : "navigating",
      position, progress, straight,
    });
    if (shouldReroute) this.reroute(position);
  }

  private reroute(from: LatLng): void {
    const target = this.state.target;
    if (!target || this.controller || !this.isOnline()) return;
    if (this.now() - this.lastRerouteAt < REROUTE_INTERVAL_MS) return;
    this.lastRerouteAt = this.now();
    const controller = new AbortController();
    this.controller = controller;
    this.set({ ...this.state, status: "rerouting" });
    this.options.getRoute(from, target.destination, { signal: controller.signal }).then(
      (route) => {
        if (controller.signal.aborted || this.state.target !== target) return;
        const clear = clearRoutes(route, this.hazards, from)[0];
        const chosen = clear ?? route;
        const position = this.state.position ?? from;
        this.offRouteFixes = 0;
        this.set({
          ...this.state, status: "navigating", route: chosen, progress: routeProgress(chosen, position),
          nearHazard: !clear, rerouteFailed: false,
        });
      },
      () => {
        if (controller.signal.aborted || this.state.target !== target) return;
        this.set({ ...this.state, status: "navigating", rerouteFailed: true });
      },
    ).finally(() => {
      if (this.controller === controller) this.controller = null;
    });
  }

  private set(next: NavState): void {
    this.state = next;
    this.listeners.forEach((listener) => listener());
  }
}
