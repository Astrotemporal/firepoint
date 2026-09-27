import type { Hazard } from "../../src/evacuation/types";

/** SYNTHETIC TEST FIXTURE ONLY. Never import from a resident-facing module. */
export const SYNTHETIC_HAZARDS: readonly Hazard[] = [{
  id: "SYNTHETIC-TEST-FIRE", type: "fire", center: { lat: 34.185, lng: -118.235 },
  radiusMeters: 1500, severity: 4, label: "SYNTHETIC TEST fire · Verdugo Mountains", simulated: true,
}];
