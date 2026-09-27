/**
 * Shared types for the location + routing module. Points use named WGS84 fields here;
 * the wire contract in `@/domain/contracts` uses `[longitude, latitude]` tuples instead.
 */
export type LatLng = { lat: number; lng: number };

export type HazardType = "fire" | "flood" | "hurricane" | "earthquake" | "heat";

export type Hazard = {
  id: string;
  type: HazardType;
  center: LatLng;
  radiusMeters: number;
  severity: 1 | 2 | 3 | 4 | 5;
  label: string;
  /** True for stubbed/demo hazards. The UI must never present these as real incidents. */
  simulated: boolean;
  /** A fire mark this person placed on their own device: private, never a report or a confirmed incident. */
  userMark?: boolean;
};

export type ShelterStatus = "open" | "full" | "closed";

export type Shelter = LatLng & {
  id: string;
  name: string;
  address: string;
  /** Null means unknown, never "unlimited". */
  capacity: number | null;
  currentOccupancy: number | null;
  petsAllowed: boolean | null;
  adaCompliant: boolean | null;
  status: ShelterStatus;
  /** False until the City of Glendale / Red Cross confirms the site operates as a shelter. */
  verified: boolean;
};

/** A general evacuation point outside the high-risk foothill/wildfire interface. */
export type SafeZone = LatLng & {
  id: string;
  name: string;
  description: string;
  priority: "primary" | "secondary";
};

/** The maneuver at the start of a step, for its turn arrow. */
export type Turn =
  | "depart" | "arrive" | "straight" | "uturn"
  | "slight-left" | "left" | "sharp-left" | "slight-right" | "right" | "sharp-right";

export type RouteStep = {
  instruction: string;
  distanceMeters: number;
  durationSeconds: number;
  turn?: Turn;
};

export type Route = {
  path: LatLng[];
  distanceMeters: number;
  durationSeconds: number;
  steps: RouteStep[];
  /** Other routes the provider offered for the same trip, used when this one crosses a hazard. */
  alternatives?: Route[];
};

/** Provider-agnostic driving route lookup. Rejects when no route is available. */
export type GetRoute = (from: LatLng, to: LatLng, options?: { signal?: AbortSignal }) => Promise<Route>;
