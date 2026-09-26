import type { FireMark } from "@/domain/fire-marks";
import type { Hazard } from "./types";

/**
 * Fire marks count as fires for routing, so directions avoid them. A mark is a point, so it gets a
 * fixed radius; the usual buffers then apply (shelters within 1 km of the edge are skipped, and
 * routes must stay 500 m clear of it).
 */
export const MARK_RADIUS_METERS = 500;

export const markLabel = (index: number) => `Fire mark ${index + 1}`;

export function markHazards(marks: readonly FireMark[]): Hazard[] {
  return marks.map((mark, index) => ({
    id: `mark-${mark.id}`,
    type: "fire",
    center: { lat: mark.lat, lng: mark.lng },
    radiusMeters: MARK_RADIUS_METERS,
    severity: 3,
    label: markLabel(index),
    simulated: false,
    userMark: true,
  }));
}
