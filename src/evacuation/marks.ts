import type { FireMark } from "@/domain/fire-marks";
import type { Hazard } from "./types";

export const markLabel = (index: number) => `Fire mark ${index + 1}`;

/** Arbitrary UI sketch size, NOT a measured fire extent, warning ring or avoidance buffer. */
export const PRIVATE_MARK_DISPLAY_RADIUS_METERS = 500;

/** Distinct from Hazard: display-only red dashed halos, never an incident or evacuation zone. */
export function privateMarkHalos(marks: readonly FireMark[]) {
  return marks.map((mark, index) => ({
    kind: "private-display-halo" as const, id: mark.id,
    center: { lat: mark.lat, lng: mark.lng }, displayRadiusMeters: PRIVATE_MARK_DISPLAY_RADIUS_METERS,
    label: markLabel(index),
  }));
}

/** Private device marks are visual bookmarks, not incident reports or routing hazards. */
export function selectRoutingHazards({ sourceHazards }: {
  sourceHazards: readonly Hazard[];
  privateMarks: readonly FireMark[];
}): readonly Hazard[] {
  return sourceHazards;
}
