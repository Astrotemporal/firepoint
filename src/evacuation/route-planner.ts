import {
  haversine, pickEscapePoint, pickEscapeRoute, pickShelter, rankShelters,
  type EscapePick, type ShelterPick,
} from "./routing";
import type { GetRoute, Hazard, LatLng, SafeZone, Shelter } from "./types";

export type RoutePlan<O extends LatLng = LatLng> = {
  origin: O;
  /** The hazard list this plan was checked against. */
  hazardsKey: string;
  shelter: ShelterPick;
  escape: EscapePick;
  computedAt: number;
};

export type PlannerState<O extends LatLng = LatLng> = {
  plan: RoutePlan<O> | null;
  /** A recompute is scheduled or in flight; the previous plan stays visible meanwhile. */
  pending: boolean;
};

type PlanInput = {
  origin: LatLng;
  hazards: readonly Hazard[];
  shelters: readonly Shelter[];
  zones: readonly SafeZone[];
  getRoute: GetRoute;
  offline: boolean;
  signal?: AbortSignal;
};

/** Both routes at once. Offline, skip the provider and return straight-line targets. */
export async function planRoutes({ origin, hazards, shelters, zones, getRoute, offline, signal }: PlanInput) {
  if (offline) {
    const nearest = rankShelters(origin, shelters, hazards)[0]?.shelter;
    const zone = pickEscapePoint(origin, zones, hazards);
    const shelter: ShelterPick = nearest
      ? { kind: "routing-unavailable", shelter: nearest, reason: "offline" }
      : { kind: "no-shelter" };
    const escape: EscapePick = zone ? { kind: "routing-unavailable", zone, reason: "offline" } : { kind: "no-zone" };
    return { shelter, escape };
  }
  const [shelter, escape] = await Promise.all([
    pickShelter(origin, shelters, hazards, getRoute, { signal }),
    pickEscapeRoute(origin, zones, hazards, getRoute, { signal }),
  ]);
  return { shelter, escape };
}

/** Changes whenever a hazard is added, removed, moved, resized, or re-rated. */
export function hazardsKey(hazards: readonly Hazard[]): string {
  return hazards
    .map((h) => `${h.id}:${h.type}:${h.center.lat.toFixed(5)}:${h.center.lng.toFixed(5)}:${h.radiusMeters}:${h.severity}`)
    .sort()
    .join("|");
}

export type RoutePlannerOptions = {
  getRoute: GetRoute;
  shelters: readonly Shelter[];
  zones: readonly SafeZone[];
  isOnline?: () => boolean;
  /** Wait after the first qualifying change; later GPS ticks in that window join the same run. */
  debounceMs?: number;
  moveThresholdMeters?: number;
  /** Movement-triggered runs start at least this long after the previous run. */
  minIntervalMs?: number;
  now?: () => number;
};

/**
 * Recomputes routes only when the origin moves beyond the threshold or the hazard list changes,
 * coalescing GPS ticks so the routing API is never called per tick. Newer runs cancel older ones.
 * Offline, a plan made against the current hazard list is kept rather than replaced with
 * straight-line guidance.
 */
export class RoutePlanner<O extends LatLng = LatLng> {
  private state: PlannerState<O> = { plan: null, pending: false };
  private readonly listeners = new Set<() => void>();
  private origin: O | null = null;
  private hazards: readonly Hazard[] = [];
  private lastRun: { origin: LatLng; hazardsKey: string; at: number } | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private timerDueAt = 0;
  private controller: AbortController | null = null;
  private runId = 0;
  private readonly debounceMs: number;
  private readonly moveThresholdMeters: number;
  private readonly minIntervalMs: number;
  private readonly now: () => number;
  private readonly isOnline: () => boolean;

  constructor(private readonly options: RoutePlannerOptions) {
    this.debounceMs = options.debounceMs ?? 1_500;
    this.moveThresholdMeters = options.moveThresholdMeters ?? 150;
    this.minIntervalMs = options.minIntervalMs ?? 8_000;
    this.now = options.now ?? Date.now;
    this.isOnline = options.isOnline ?? (() => true);
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  getSnapshot = () => this.state;

  /** Feed every location or hazard update; only meaningful changes schedule work. */
  update(origin: O, hazards: readonly Hazard[]): void {
    this.origin = origin;
    this.hazards = hazards;
    const last = this.lastRun;
    const hazardsChanged = !last || last.hazardsKey !== hazardsKey(hazards);
    if (!hazardsChanged && haversine(last.origin, origin) <= this.moveThresholdMeters) return;
    const earliest = hazardsChanged || !last ? 0 : last.at + this.minIntervalMs - this.now();
    this.schedule(Math.max(this.debounceMs, earliest));
  }

  /** Recompute soon regardless of movement (reconnect, retry button). */
  refresh(): void {
    if (this.origin) this.schedule(0);
  }

  /** Cancel pending work (unmount). A later `update()` starts fresh. */
  stop(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.controller?.abort();
    this.controller = null;
    this.lastRun = null;
    this.runId++;
    if (this.state.pending) this.set({ ...this.state, pending: false });
  }

  private schedule(delayMs: number): void {
    const dueAt = this.now() + delayMs;
    if (this.timer !== null) {
      if (this.timerDueAt <= dueAt) return; // already scheduled sooner; it will use the latest origin
      clearTimeout(this.timer);
    }
    this.timerDueAt = dueAt;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.run();
    }, delayMs);
    if (!this.state.pending) this.set({ ...this.state, pending: true });
  }

  private async run(): Promise<void> {
    const origin = this.origin;
    if (!origin) return;
    const hazards = this.hazards;
    const key = hazardsKey(hazards);
    const offline = !this.isOnline();
    this.lastRun = { origin, hazardsKey: key, at: this.now() };
    if (offline && this.state.plan?.hazardsKey === key) {
      this.set({ ...this.state, pending: false });
      return;
    }
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    const id = ++this.runId;
    this.set({ ...this.state, pending: true });
    try {
      const { shelters, zones, getRoute } = this.options;
      const result = await planRoutes({ origin, hazards, shelters, zones, getRoute, offline, signal: controller.signal });
      if (id !== this.runId) return;
      this.set({ plan: { origin, hazardsKey: key, ...result, computedAt: this.now() }, pending: this.timer !== null });
    } catch {
      if (id !== this.runId) return;
      // Only an abort reaches here; routing failures are returned as plan states.
      this.set({ ...this.state, pending: this.timer !== null });
    }
  }

  private set(next: PlannerState<O>): void {
    this.state = next;
    this.listeners.forEach((listener) => listener());
  }
}
