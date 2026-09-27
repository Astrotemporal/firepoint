/*
 * One drawing convention for concentric ring graphics; the meaning stays on the discriminant.
 *
 * The /prepare defensible-space bands and the map's private mark halo are drawn the same way on
 * purpose (concentric, an inner solid edge, a dashed outermost edge, a radius label) so they read
 * as the same kind of picture. They share NOTHING else: not a unit, not a source, not a meaning.
 * A private halo can never carry feet or a citation; a defensible-space band can never carry a map
 * position or a device provenance. `ringStack` refuses to mix the two.
 */
import type { LatLng } from "@/evacuation/types";
import { SOURCES, ZONES, type Source } from "./wildfire-guide";

/** A cited house-preparation band, measured out from a house. Not a map overlay, never a live status. */
export type DefensibleSpaceBand = {
  kind: "defensible-space-band";
  meaning: "house-prep-guidance";
  unit: "ft";
  band: 1 | 2 | 3;
  name: string;
  innerFeet: number;
  outerFeet: number;
  /** Where the distances come from (LA County Fire, Ready! Set! Go!). */
  citation: Source;
};

/**
 * A dashed circle drawn around a private fire mark. The radius is an arbitrary display size:
 * not an order/warning zone, fire perimeter, report density or any physical risk estimate.
 */
export type PrivateDisplayHalo = {
  kind: "private-display-halo";
  meaning: "arbitrary-display-sketch";
  unit: "m";
  provenance: "this-device";
  id: string;
  center: LatLng;
  displayRadiusMeters: number;
  label: string;
};

export type RingVisual = DefensibleSpaceBand | PrivateDisplayHalo;

/** Dash rhythm for a sketched or outermost edge: SVG `stroke-dasharray` units and Mapbox line-width units. */
export const RING_DASH = [3, 4] as const;

/** Chapter I bands derived from the guide's ZONES, so the figure and the contract cannot drift apart. */
export const DEFENSIBLE_SPACE_BANDS: readonly DefensibleSpaceBand[] = ZONES.map((zone, index) => ({
  kind: "defensible-space-band" as const, meaning: "house-prep-guidance" as const, unit: "ft" as const,
  band: (index + 1) as 1 | 2 | 3, name: zone.name,
  innerFeet: index === 0 ? 0 : ZONES[index - 1]!.feet, outerFeet: zone.feet, citation: SOURCES.rsg,
}));

/** Outer radius in the ring's own unit. Callers scale it (px for SVG, metres for the map); never convert across kinds. */
export function ringRadius(ring: RingVisual): number {
  return ring.kind === "defensible-space-band" ? ring.outerFeet : ring.displayRadiusMeters;
}

/** Short radius label with the unit fixed by the kind: "30 ft" or "500 m · private sketch". */
export function ringLabel(ring: RingVisual): string {
  return ring.kind === "defensible-space-band" ? `${ring.outerFeet} ${ring.unit}` : `${ring.displayRadiusMeters} ${ring.unit} · private sketch`;
}

/** One-sentence accessible description; the halo sentence always says what it is not. */
export function ringDescription(ring: RingVisual): string {
  if (ring.kind === "defensible-space-band") return `${ring.name} is ${ring.innerFeet} to ${ring.outerFeet} feet from the house.`;
  return `${ring.label}: a private ${ring.displayRadiusMeters} m display sketch on this device, not a fire perimeter, evacuation zone or report.`;
}

export type RingEdge<R extends RingVisual> = {
  ring: R;
  radius: number;
  /** The outermost edge is dashed: it is the limit of a drawing, not a measured line. A halo is always outermost. */
  dashed: boolean;
  label: string;
  description: string;
};

/**
 * Drawing order for one concentric set: outermost first so inner rings paint on top. Halos are each a
 * single dashed ring; listing several never makes them concentric, aggregated or an area.
 * Overloads keep the sets homogeneous at compile time; the runtime check keeps them so at the boundary.
 */
export function ringStack(rings: readonly DefensibleSpaceBand[]): RingEdge<DefensibleSpaceBand>[];
export function ringStack(rings: readonly PrivateDisplayHalo[]): RingEdge<PrivateDisplayHalo>[];
export function ringStack(rings: readonly RingVisual[]): RingEdge<RingVisual>[] {
  const kinds = new Set(rings.map((ring) => ring.kind));
  if (kinds.size > 1) throw new Error("ringStack: defensible-space bands and private halos are never one picture");
  const sorted = [...rings].sort((a, b) => ringRadius(b) - ringRadius(a));
  return sorted.map((ring, index) => ({
    ring, radius: ringRadius(ring),
    dashed: ring.kind === "private-display-halo" || index === 0,
    label: ringLabel(ring), description: ringDescription(ring),
  }));
}
