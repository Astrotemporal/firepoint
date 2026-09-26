import type { Hazard } from "./types";

/*
 * STUB hazard source. Disaster detection lives elsewhere; see README "Replacing the hazard stub".
 * Contract for a real feed: getActiveHazards() returns the SAME array instance until the list
 * changes (it backs React's useSyncExternalStore), and subscribers are called after each change.
 */

/** Test/demo fire in the Verdugo Mountains. Not a real incident. */
export const SIMULATED_HAZARDS: readonly Hazard[] = [
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

let active: readonly Hazard[] = SIMULATED_HAZARDS;
const listeners = new Set<() => void>();

export function getActiveHazards(): readonly Hazard[] {
  return active;
}

export function subscribeToHazards(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Demo control for the stub (e.g. hide the simulated fire). A real feed would not expose this. */
export function setStubHazards(next: readonly Hazard[]): void {
  active = next;
  listeners.forEach((listener) => listener());
}
