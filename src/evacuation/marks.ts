import type { FireMark } from "@/domain/fire-marks";
import type { Hazard } from "./types";

export const markLabel = (index: number) => `Fire mark ${index + 1}`;

/** Private device marks are visual bookmarks, not incident reports or routing hazards. */
export function selectRoutingHazards({ sourceHazards }: {
  sourceHazards: readonly Hazard[];
  privateMarks: readonly FireMark[];
}): readonly Hazard[] {
  return sourceHazards;
}
