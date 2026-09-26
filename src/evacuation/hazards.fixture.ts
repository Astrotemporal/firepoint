import type { Hazard } from "./types";

/** Test-only fire in the Verdugo Mountains. Not a real incident, and never shown in the app. */
export const TEST_HAZARDS: readonly Hazard[] = [
  {
    id: "simulated-verdugo-fire",
    type: "fire",
    center: { lat: 34.185, lng: -118.235 },
    radiusMeters: 1500,
    severity: 4,
    label: "Simulated fire · Verdugo Mountains",
    simulated: true,
  },
];
