import { z } from "zod";
import { fetchWithTimeout, RequestTimeoutError } from "@/lib/fetch-with-timeout";
import { MAPBOX_TOKEN } from "@/lib/mapbox";
import type { GetRoute, LatLng, Route, Turn } from "./types";

/*
 * Routing provider boundary. The app only calls `getRoute`; to change providers, write another
 * GetRoute that returns the same `Route` shape and change `activeProvider` below
 * (see docs/architecture.md "Swapping the routing provider").
 */

export class RouteUnavailableError extends Error {
  constructor(message: string, readonly reason: "not-configured" | "http" | "no-route" | "invalid-response" | "timeout") {
    super(message);
    this.name = "RouteUnavailableError";
  }
}

const MapboxRouteSchema = z.object({
  distance: z.number(),
  duration: z.number(),
  geometry: z.object({ type: z.literal("LineString"), coordinates: z.array(z.tuple([z.number(), z.number()])).min(2) }),
  legs: z.array(z.object({
    steps: z.array(z.object({
      distance: z.number(),
      duration: z.number(),
      maneuver: z.object({ instruction: z.string(), type: z.string().optional(), modifier: z.string().optional() }),
      /** `classes` names the kind of road leaving each intersection ("motorway", "toll", …). */
      intersections: z.array(z.object({ classes: z.array(z.string()).optional() })).optional(),
    })),
  })),
});
const MapboxDirectionsSchema = z.object({
  code: z.string(),
  message: z.string().optional(),
  routes: z.array(MapboxRouteSchema).optional(),
});

const TURNS: readonly Turn[] = ["straight", "uturn", "slight-left", "left", "sharp-left", "slight-right", "right", "sharp-right"];

/** Mapbox's maneuver type ("depart", "arrive", …) and modifier ("slight right", …) as a turn arrow, when it maps to one. */
function toTurn({ type, modifier }: { type?: string; modifier?: string }): Turn | undefined {
  if (type === "depart" || type === "arrive") return type;
  const turn = modifier?.replace(" ", "-");
  return TURNS.find((known) => known === turn);
}

function toRoute(route: z.infer<typeof MapboxRouteSchema>): Route {
  const steps = route.legs.flatMap((leg) => leg.steps);
  // The step before "arrive" is the road the trip ends on; its last intersection says what kind of road that is.
  const approach = steps.at(-2) ?? steps.at(-1);
  return {
    path: route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
    distanceMeters: route.distance,
    durationSeconds: route.duration,
    steps: steps.map((step) => ({
      instruction: step.maneuver.instruction,
      distanceMeters: step.distance,
      durationSeconds: step.duration,
      turn: toTurn(step.maneuver),
    })),
    ...(approach?.intersections?.at(-1)?.classes?.includes("motorway") ? { arrivesOnMotorway: true } : {}),
  };
}

/** Validate a Mapbox Directions response: first route plus up to two alternatives. */
export function parseMapboxDirections(payload: unknown): Route {
  const parsed = MapboxDirectionsSchema.safeParse(payload);
  if (!parsed.success) throw new RouteUnavailableError("Unexpected routing response", "invalid-response");
  const [primary, ...alternatives] = parsed.data.routes ?? [];
  if (parsed.data.code !== "Ok" || !primary) {
    throw new RouteUnavailableError(parsed.data.message ?? `No route (${parsed.data.code})`, "no-route");
  }
  return { ...toRoute(primary), alternatives: alternatives.map(toRoute) };
}

export type MapboxDirectionsOptions = {
  token?: string;
  /** `driving-traffic` uses live and historic traffic. */
  profile?: "driving-traffic" | "driving";
  fetcher?: typeof fetch;
  timeoutMs?: number;
  /** Language for turn-by-turn step text (a Mapbox-supported code). */
  language?: string;
};

const lngLat = (point: LatLng) => `${point.lng.toFixed(6)},${point.lat.toFixed(6)}`;

/**
 * Mapbox Directions over HTTP POST, so trip coordinates travel in the request body rather than
 * the URL. Asks for alternatives, which the hazard check falls back to when a route crosses one.
 */
export function createMapboxDirectionsProvider({
  token = MAPBOX_TOKEN,
  profile = "driving-traffic",
  fetcher = (input, init) => fetch(input, init),
  timeoutMs = 10_000,
  language = "en",
}: MapboxDirectionsOptions = {}): GetRoute {
  return async (from, to, { signal } = {}) => {
    if (!token) throw new RouteUnavailableError("Mapbox token is not configured", "not-configured");
    const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}?access_token=${encodeURIComponent(token)}`;
    const body = new URLSearchParams({
      coordinates: `${lngLat(from)};${lngLat(to)}`,
      alternatives: "true",
      geometries: "geojson",
      overview: "full",
      steps: "true",
      language,
    });
    let response: Response;
    try {
      response = await fetchWithTimeout(fetcher, url, { method: "POST", body, signal, headers: { Accept: "application/json" } }, timeoutMs);
    } catch (error) {
      if (error instanceof RequestTimeoutError) throw new RouteUnavailableError("Routing request timed out", "timeout");
      throw error;
    }
    if (!response.ok && response.status !== 422) throw new RouteUnavailableError(`Routing HTTP ${response.status}`, "http");
    return parseMapboxDirections(await response.json());
  };
}

const activeProvider: GetRoute = createMapboxDirectionsProvider();

/** The one routing entry point used by the app. */
export const getRoute: GetRoute = (from, to, options) => activeProvider(from, to, options);

const localized = new Map<string, GetRoute>();
/** Routing with step text in another language; English uses the shared `getRoute`. */
export function getRouteIn(language: string): GetRoute {
  if (language === "en") return getRoute;
  let provider = localized.get(language);
  if (!provider) localized.set(language, provider = createMapboxDirectionsProvider({ language }));
  return provider;
}
