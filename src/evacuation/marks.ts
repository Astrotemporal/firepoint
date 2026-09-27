import type { FireMark } from "@/domain/fire-marks";
import type { PrivateDisplayHalo } from "@/domain/ring-visual";
import type { Hazard } from "./types";

export const markLabel = (index: number) => `Fire mark ${index + 1}`;

/** Arbitrary UI sketch size, NOT a measured fire extent, warning ring or avoidance buffer. */
export const PRIVATE_MARK_DISPLAY_RADIUS_METERS = 500;

/**
 * Distinct from Hazard: display-only red dashed halos, never an incident or evacuation zone.
 * Typed by the shared ring-visual contract, which fixes the unit (m), meaning and provenance per kind.
 */
export function privateMarkHalos(marks: readonly FireMark[]): PrivateDisplayHalo[] {
  return marks.map((mark, index) => ({
    kind: "private-display-halo", meaning: "arbitrary-display-sketch", unit: "m", provenance: "this-device",
    id: mark.id, center: { lat: mark.lat, lng: mark.lng }, displayRadiusMeters: PRIVATE_MARK_DISPLAY_RADIUS_METERS,
    label: markLabel(index),
  }));
}

/**
 * A person's marks are the fire their own directions steer around: the escape route leads out of each mark's fire
 * zone and shelters near one are skipped. A mark is a point, so for routing it gets this fixed radius; it is not a
 * measured fire extent, and a mark is never a report or an incident.
 */
export const MARK_RADIUS_METERS = 500;

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

/** Feed hazards plus this device's marks; the feed's own array when there are no marks. */
export function selectRoutingHazards({ sourceHazards, privateMarks }: {
  sourceHazards: readonly Hazard[];
  privateMarks: readonly FireMark[];
}): readonly Hazard[] {
  return privateMarks.length ? [...sourceHazards, ...markHazards(privateMarks)] : sourceHazards;
}
